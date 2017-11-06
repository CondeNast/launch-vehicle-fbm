## 1.9.0

* [[`05685993b5`](https://github.com/CondeNast/launch-vehicle-fbm/commit/05685993b5)] - Enable 'referral' event for Messenger Code scans. Now you can handle parametric codes (#82)
* [[`f9b1778f2e`](https://github.com/CondeNast/launch-vehicle-fbm/commit/f9b1778f2e)] - Add "Quick Start" to Sphinx docs (#81)
* [[`723caae100`](https://github.com/CondeNast/launch-vehicle-fbm/commit/723caae100)] - POC Sphinx documentation (#80)
* [[`b147efa71c`](https://github.com/CondeNast/launch-vehicle-fbm/commit/b147efa71c)] - Handle a wider variety of messages more gracefully (#79)
* [[`4371128fd8`](https://github.com/CondeNast/launch-vehicle-fbm/commit/4371128fd8)] - Use fallback instead of exploding when failing to get a profile (#77)

## 1.8.0

* [[`578628589c`](https://github.com/CondeNast/launch-vehicle-fbm/commit/578628589c)] - Add quick_replies() to Text and Image. ImageQuickReply is now deprecated. (#75)

## 1.7.0

* [[`2e018d176e`](https://github.com/CondeNast/launch-vehicle-fbm/commit/2e018d176e)] - Add "pause" webhook to allow for live person takeovers (#71)
* [[`b9f785fc17`](https://github.com/CondeNast/launch-vehicle-fbm/commit/b9f785fc17)] - Bump cache timeout from 1hr to 1day (#70)

## 1.6.0

No code changes, just upgraded dependencies and documentation.

* [[`973b4e9332`](https://github.com/CondeNast/launch-vehicle-fbm/commit/973b4e9332)] - Add npm@5 package-lock.json artifact (#69)
* [[`4043b00242`](https://github.com/CondeNast/launch-vehicle-fbm/commit/4043b00242)] - Updating dependencies, new lint rules, satisfying new lint rules (#68)
* [[`67ad4c3b8d`](https://github.com/CondeNast/launch-vehicle-fbm/commit/67ad4c3b8d)] - Docs: Sell ourselves better (#66)

## 1.5.0

* [[`6d68f7d0df`](https://github.com/CondeNast/launch-vehicle-fbm/commit/6d68f7d0df)] - Limit `verifyRequestSignature` calls on `application/json` POSTs to the Messenger webhook route (#62)
* [[`3743c9104c`](https://github.com/CondeNast/launch-vehicle-fbm/commit/3743c9104c)] - Make test teardown easier by using `sinon.sandbox` (#59)

## 1.4.0

* [[`8cb44accba`](https://github.com/CondeNast/launch-vehicle-fbm/commit/8cb44accba)] - Some cleanup & organization on the `events` section of the `README` (#55)
* [[`52d1d42177`](https://github.com/CondeNast/launch-vehicle-fbm/commit/52d1d42177)] - Check postbacks against 'greetings' & 'help' regexs; 'payload' consistency for postbacks and quick replies (#52)
* [[`3aa8a70342`](https://github.com/CondeNast/launch-vehicle-fbm/commit/3aa8a70342)] - Add 'app.starting' and 'app.started' events (#56)
* [[`2717a965f0`](https://github.com/CondeNast/launch-vehicle-fbm/commit/2717a965f0)] - Add smart reply to remove boilerplate (#53)
* [[`2b4c71094c`](https://github.com/CondeNast/launch-vehicle-fbm/commit/2b4c71094c)] - Add plumbing for page specific operations (#49)

## 1.3.0

*  [[`1d96d9d57f`](https://github.com/CondeNast/launch-vehicle-fbm/commit/1d96d9d57f)] - Add ability to bring your own cache storage (#48)

## 1.2.0

* [[`51d4ca11aa`](https://github.com/CondeNast/launch-vehicle-fbm/commit/51d4ca11aa)] - Store the page id for conversations in the session (#44)
* [[`cbf506862b`](https://github.com/CondeNast/launch-vehicle-fbm/commit/cbf506862b)] - Document session.profile (#43)
* [[`1f094098ed`](https://github.com/CondeNast/launch-vehicle-fbm/commit/1f094098ed)] - Add printf-like formatting to Text response helper (#42)

## 1.1.1

* [[`203c09c739`](https://github.com/CondeNast/launch-vehicle-fbm/commit/203c09c739)] - Fix premature 60s session timeouts (#40)

## 1.1.0

* [[`f7500fc63a`](https://github.com/CondeNast/launch-vehicle-fbm/commit/f7500fc63a)] - Add: Kill killswitch for events that come in via message_echoes (#37)
* [[`a343c478ce`](https://github.com/CondeNast/launch-vehicle-fbm/commit/a343c478ce)] - Docs: Remove example key-value pairs that do not apply to the SDK (#35)

## 1.0.0

- Initial release
