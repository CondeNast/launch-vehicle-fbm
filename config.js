const MESSENGER_HOOK_PATH = '/webhook';
const VALIDATION_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN;
const APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const PAGE_ACCESS_TOKEN = process.env.MESSENGER_PAGE_ACCESS_TOKEN;

// if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN && SERVER_URL)) {
if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN)) {
  console.error('Missing config values');
  process.exit(1);
}

module.exports = {
  MESSENGER_HOOK_PATH,
  VALIDATION_TOKEN,
  APP_SECRET,
  PAGE_ACCESS_TOKEN
};
