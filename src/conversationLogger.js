// A knockoff of Dashbot's API for generic conversation logging
const dashbot = require('dashbot');
const winston = require('winston');
const Slack = require('winston-slack-transport');

const config = require('./config');

class ConversationLogger {
  /*:: options: Object */
  constructor() {

    this.logger = new (winston.Logger)({transports: []});

    if (config.has('logFile')) {
      this.logger.add(winston.transports.File, {
        filename: config.get('logFile'),
        json: true
      });
    }
    this.dashbotClient = config.has('dashBotKey') ? dashbot(config.get('dashBotKey')).facebook : false;

    if (config.has('slack.webhookUrl') && config.has('slack.channel')) {
      this.logger.add(Slack, {
        webhook_url: config.get('slack.webhookUrl'),
        username: 'Chat Spy',
        custom_formatter: this.slackFormatter
      });
      this.slackChannel = config.get('slack.channel');
    }
  }

  slackFormatter(level, msg, meta) {
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
        } else {
          return 'Unknown meta.attachments[]: `' + JSON.stringify(attachment) + '`';
        }
      }).join('\n');
    }

    return {
      channel: this.slackChannel,
      icon_url: `https://robohash.org/${meta.userId}.png`,
      username: meta.userId,
      text: addressee + text
    };
  }

  logIncoming(requestBody) {
    if (this.dashbotClient) {
      this.dashbotClient.logIncoming(requestBody);
    }
    const data = requestBody.entry[0].messaging[0];
    if (!(data.postback || data.message)) {
      // console.log(JSON.stringify(data));  // enable for DEBUG
      return;
    }

    this.logger.info(Object.assign({
      userId: data.sender.id,
      senderId: data.sender.id
    }, data.message || {}, data.postback || {}));
  }

  logOutgoing(requestData, responseBody) {
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
