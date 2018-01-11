const assert = require('assert');
const sinon = require('sinon');
const { ConversationLogger } = require('../src/conversationLogger');

const config = require('config').get('launch-vehicle-fbm');

describe('conversationLogger', () => {
  let sandbox;
  const conversationLogger = new ConversationLogger(config);
  const { logger } = conversationLogger; // shorter alias

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    sandbox.stub(logger, 'info');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('logIncoming', () => {
    it('records incoming messages', () => {
      const incomingTextMessage = JSON.parse('{"object":"page","entry":[{"id":"910102032453986","time":1481320428844,"messaging":[{"sender":{"id":"112358132123"},"recipient":{"id":"910102032453986"},"timestamp":1481320428816,"message":{"mid":"mid.1481320428816:61dbeb3022","seq":66,"text":"ping"}}]}]}');

      conversationLogger.logIncoming(incomingTextMessage);

      assert.deepEqual(logger.info.args[0][0], {
        senderId: '112358132123',
        userId: '112358132123',
        mid: 'mid.1481320428816:61dbeb3022',
        text: 'ping',
        // Extra stuff
        seq: 66
      });
    });

    it('skips incoming non message', () => {
      const incomingTextMessage = JSON.parse('{"object":"page","entry":[{"id":"910102032453986","time":1481320428844,"messaging":[{"sender":{"id":"112358132123"},"recipient":{"id":"910102032453986"},"timestamp":1481320428816,"foo":{}}]}]}');

      conversationLogger.logIncoming(incomingTextMessage);

      assert.equal(logger.info.callCount, 0);
    });
  });

  describe('logOutgoing', () => {
    it('records outgoing messages', () => {
      const requestData = JSON.parse('{"uri":"https://graph.facebook.com/v2.8/me/messages","qs":{"access_token":"AAAAAAAA"},"method":"POST","json":{"dashbotTemplateId":"right","recipient":{"id":"112358132123"},"message":{"text":"pong"}}}');
      const responseBody = JSON.parse('{"recipient_id":"112358132123","message_id":"mid.1481324263294:c9e4cf3002"}');

      conversationLogger.logOutgoing(requestData, responseBody);

      assert.deepEqual(logger.info.args[0][0], {
        recipientId: '112358132123',
        userId: '112358132123',
        mid: 'mid.1481324263294:c9e4cf3002',
        text: 'pong'
      });
    });
  });

  describe('slackFormatter', () => {
    it('handles incoming text', () => {
      const meta = JSON.parse('{"userId":"1250872178269050","senderId":"1250872178269050","mid":"mid.1481329191720:60619e2a50","seq":153,"text":"moondog"}');
      const output = conversationLogger.slackFormatter(null, null, meta);
      assert.equal(output.text, '> moondog');
    });

    it('handles incoming image', () => {
      const meta = JSON.parse('{"userId":"1250872178269050","senderId":"1250872178269050","mid":"mid.1481329523595:0e59b3e916","seq":159,"attachments":[{"type":"image","payload":{"url":"https://scontent.xx.fbcdn.net/v/t34.0-12/15417043_10108673655147430_1732608277_n.gif?_nc_ad=z-m&oh=e035946270dae169ccca80ca13198b60&oe=584D40D0"}}]}');
      const output = conversationLogger.slackFormatter(null, null, meta);
      assert.equal(output.text, '> https://scontent.xx.fbcdn.net/v/t34.0-12/15417043_10108673655147430_1732608277_n.gif?_nc_ad=z-m&oh=e035946270dae169ccca80ca13198b60&oe=584D40D0');
    });

    it('handles incoming unknown attachment', () => {
      const meta = JSON.parse('{"userId":"1250872178269050","senderId":"1250872178269050","mid":"mid.1481329523595:0e59b3e916","seq":159,"attachments":[{"type":"foo"}]}');
      const output = conversationLogger.slackFormatter(null, null, meta);
      assert.equal(output.text, '> Unknown meta.attachments[]: `{"type":"foo"}`');
    });

    it('handles outgoing text', () => {
      const meta = JSON.parse('{"recipientId":"1250872178269050","userId":"1250872178269050","mid":"mid.1481329386146:9ca79ed341","text":"pong"}');
      const output = conversationLogger.slackFormatter(null, null, meta);
      assert.equal(output.text, 'pong');
    });

    it('handles outgoing templates', () => {
      const meta = JSON.parse('{"recipientId":"1250872178269050","userId":"1250872178269050","mid":"mid.1481329192773:68c167ad46","attachment":{"type":"template","payload":{"template_type":"generic","elements":[{"title":"Not sure what you meant there...","subtitle":"But we are here to help! Type \'help\' or click the button below for assistance.","buttons":[{"type":"postback","title":"Help","payload":"help"}]}]}}}');
      const output = conversationLogger.slackFormatter(null, null, meta);
      assert.equal(output.text, 'Not sure what you meant there...');
    });

    it('handles outgoing image', () => {
      const meta = JSON.parse('{"recipientId":"1250872178269050","userId":"1250872178269050","mid":"mid.1481825029837:52c2d20021","attachment":{"type":"image","payload":{"url":"https://cn-partnerships-nonprod.s3.amazonaws.com/beauty-lenses/1250872178269050-1481825027665-89d2a983-d9b3-438a-bcb2-7e32c49112ef-applied"}}}');
      const output = conversationLogger.slackFormatter(null, null, meta);
      assert.equal(output.text, 'https://cn-partnerships-nonprod.s3.amazonaws.com/beauty-lenses/1250872178269050-1481825027665-89d2a983-d9b3-438a-bcb2-7e32c49112ef-applied');
    });

    it('handles outgoing unknown attachment', () => {
      const meta = JSON.parse('{"recipientId":"1250872178269050","userId":"1250872178269050","mid":"mid.1481825029837:52c2d20021","attachment":{"type":"derp","payload":{"foo":"bar"}}}');
      const output = conversationLogger.slackFormatter(null, null, meta);
      assert.equal(output.text, 'Unknown meta.attachment: `{"type":"derp","payload":{"foo":"bar"}}`');
    });

    it('handles incoming postback payload', () => {
      const meta = JSON.parse('{"userId":"1250872178269050","senderId":"1250872178269050","payload":"looks"}');
      const output = conversationLogger.slackFormatter(null, null, meta);
      assert.equal(output.text, '> `looks`');
    });
  });
});
