// @flow
// A knockoff of Dashbot's API for generic conversation logging
const dashbot = require('dashbot');
const winston = require('winston');
const Slack = require('winston-slack-transport');

class ConversationLogger {
  /*:: dashbotClient: ?Object */
  /*:: logger: winston.Logger */
  /*:: options: Object */
  // $FlowFixMe https://github.com/facebook/flow/issues/183
  constructor({ dashBotKey, logFile, slackChannel, slackWebhookUrl } = {}) {
    this.logger = new winston.Logger({ transports: [] });
    this.options = {
      dashBotKey,
      logFile,
      slackChannel,
      slackWebhookUrl
    };

    if (this.options.logFile) {
      this.logger.add(winston.transports.File, {
        filename: this.options.logFile,
        json: true
      });
    }
    this.dashbotClient = this.options.dashBotKey ? dashbot(this.options.dashBotKey).facebook : null;

    if (this.options.slackWebhookUrl && this.options.slackChannel) {
      this.logger.add(Slack, {
        webhook_url: this.options.slackWebhookUrl,
        username: 'Chat Spy',
        custom_formatter: this.slackFormatter.bind(this)
      });
    }
  }

  slackFormatter(level/*: string */, msg/*: Object */, meta/*: Object */) {
    // console.log(JSON.stringify(meta));  // enable for DEBUG
    const addressee = meta.userId === meta.recipientId ? '' : '> ';
    let text = '```' + JSON.stringify(meta, undefined, 2) + '\n```';
    if (meta.text) {
      text = meta.text;
    } else if (meta.payload) {
      text = '`' + meta.payload + '`';
    } else if (meta.attachment) {
      if (meta.attachment.type === 'template') {
        text = meta.attachment.payload.elements.map((element) => element.title).join('\n');
      } else if (meta.attachment.payload.url) {
        text = meta.attachment.payload.url;
      } else {
        text = `Unknown meta.attachment: \`${JSON.stringify(meta.attachment)}\``;
      }
    } else if (meta.attachments) {
      text = meta.attachments.map((attachment) => {
        if (attachment.payload && attachment.payload.url) {
          return attachment.payload.url;
        }

        return 'Unknown meta.attachments[]: `' + JSON.stringify(attachment) + '`';
      }).join('\n');
    }

    return {
      channel: this.options.slackChannel,
      icon_url: `https://robohash.org/${meta.userId}.png`,
      username: meta.userId,
      text: addressee + text
    };
  }

  logIncoming(requestBody/*: Object */) {
    if (this.dashbotClient) {
      this.dashbotClient.logIncoming(requestBody);
    }

    const data = requestBody.entry[0].messaging[0];
    if (!(data.postback || data.message)) {
      // console.log(JSON.stringify(data));  // enable for DEBUG
      return;
    }

    // TODO: rewrite? postbacks came along and were shoved in
    this.logger.info(Object.assign({
      userId: data.sender.id,
      senderId: data.sender.id
    }, data.message || {}, data.postback || {}));
  }

  logOutgoing(requestData/*: Object */, responseBody/*: Object */) {
    if (this.dashbotClient) {
      // TODO should we strip pageAccessToken before giving it to dashbotClient?
      // Dashbot probably uses it to get profile information
      this.dashbotClient.logOutgoing(requestData, responseBody);
    }
    this.logger.info(Object.assign({
      recipientId: requestData.json.recipient.id,
      userId: requestData.json.recipient.id,
      mid: responseBody.message_id
    }, requestData.json.message));
  }
}

exports.ConversationLogger = ConversationLogger;
