// Used for Facebook to verify that the webhook is ours
const VALIDATION_TOKEN = process.env.MESSENGER_VALIDATION_TOKEN;
// Used to validate that incoming requests are from Facebook
const APP_SECRET = process.env.MESSENGER_APP_SECRET;
// Facebook uses this to validate that our messages represent the Page
const PAGE_ACCESS_TOKEN = process.env.MESSENGER_PAGE_ACCESS_TOKEN;

// if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN && SERVER_URL)) {
if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN)) {
  console.error('Missing config values');
  process.exit(1);
}

module.exports = {
  VALIDATION_TOKEN,
  APP_SECRET,
  PAGE_ACCESS_TOKEN
};
