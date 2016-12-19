// A knockoff of dashbot's api and a stripped down copy of our message processing
const winston = require('winston');
const Slack = require('winston-slack-transport');

const logger = new (winston.Logger)({transports: []});

// Slack IDs can change, so just use the channel name
const slackChannel = ['production', 'ci'].includes(process.env.NODE_ENV) ?
  '#rkt-beautylenses-feed' : '#partnerships-zz-debug';

if (process.env.LOG_FILE) {
  logger.add(winston.transports.File, {
    filename: process.env.LOG_FILE,
    json: true
  });
}

function slackFormatter(level, msg, meta) {
  const addressee = meta.userId === meta.recipientId ? '' : '> ';
  let text = '```' + JSON.stringify(meta, undefined, 2) + '\n```';
  if (meta.text) {
    text = meta.text;
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
    channel: slackChannel,
    icon_url: `https://robohash.org/${meta.userId}.png`,
    username: meta.userId,
    text: addressee + text
  };
}

if (process.env.SLACK_WEBHOOK_URL) {
  logger.add(Slack, {
    webhook_url: process.env.SLACK_WEBHOOK_URL,
    username: 'Chat Spy',
    custom_formatter: slackFormatter
  });
}


function logIncoming(requestBody) {
  const data = requestBody.entry[0].messaging[0];
  if (!data.message || !Object.keys(data.message).length) {
    return;
  }

  logger.info(Object.assign({
    userId: data.sender.id,
    senderId: data.sender.id
  }, data.message));
}

function logOutgoing(requestData, responseBody) {
  logger.info(Object.assign({
    recipientId: requestData.json.recipient.id,
    userId: requestData.json.recipient.id,
    mid: responseBody.message_id
  }, requestData.json.message));
}

exports.logger = logger;
exports.logIncoming = logIncoming;
exports.logOutgoing = logOutgoing;
exports.slackFormatter = slackFormatter;
