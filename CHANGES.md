Inbox by Gmail Checker Changelog
--------------------------------


#### Development

- Cleanup: Move images to `media/`
- Readme: Fix badges


#### Version 4.3.0 (2017-06-21)

- Enhancement: Add "Share page via email" extension and optional page context menus ([#25](https://github.com/joeyespo/inbox-by-gmail-checker/issues/25))
- Enhancement: Add [Pomodoro](https://en.wikipedia.org/wiki/Pomodoro_Technique)-inspired "Distraction-free mode"
- Enhancement: Show current version on options page
- Enhancement: Make "tabs" permission optional with a new "focus existing Inbox tab" option
- Enhancement: Remove unnecessary permissions ([#25](https://github.com/joeyespo/inbox-by-gmail-checker/issues/25))
- Bugfix: Do nothing if current tab is already Inbox
- Bugfix: Open login page only once on disconnect
- Readme: Add a description of the extension
- Clarify option descriptions
- Cleanup


#### Version 4.2.0 (2017-02-27)

- Enhancement: Require only Gmail and Inbox permissions instead of all Google apps ([#24](https://github.com/joeyespo/inbox-by-gmail-checker/pull/24) - thanks, [@Najki][]!)
- Enhancement: Optimize all images losslessly ([#22](https://github.com/joeyespo/inbox-by-gmail-checker/pull/22) - thanks, [@CarlosHBC][]!)


#### Version 4.1.0 (2017-02-26)

- Enhancement: Focus or open Inbox when the notification is clicked
- Enhancement: Set default poll interval to 3 seconds instead of a minute
- Bugfix: Do not open a new Inbox tab when focusing an existing one ([#21](https://github.com/joeyespo/inbox-by-gmail-checker/pull/21) - thanks, [@shali3][]!)
- Bugfix: Focus an existing Inbox tab only within the current window
- Bugfix: Do not show notifications during quiet hours


#### Version 4.0.0 (2017-02-26)

- Enhancement: Add new mail notifications ([#18](https://github.com/joeyespo/inbox-by-gmail-checker/pull/18) - thanks, [@davo11122][]!)
- Enhancement: Open Inbox in the current tab if it's the empty tab ([#20](https://github.com/joeyespo/inbox-by-gmail-checker/pull/20) - thanks, [@orschiro][]!)
- Link to GitHub from the options page for questions and feedback


#### Version 3.6.0 (2016-02-20)

- Enhancement: Add Quiet Hours example
- Bugfix: Actually fix the blurry icon on retina displays ([#14](https://github.com/joeyespo/inbox-by-gmail-checker/issues/14))


#### Version 3.5.0 (2016-02-19)

- Enhancement: Fix the blurry icon on retina displays ([#14](https://github.com/joeyespo/inbox-by-gmail-checker/issues/14))
- Bugfix: Fix the connectivity problems ([#12](https://github.com/joeyespo/inbox-by-gmail-checker/issues/12))


#### Version 3.4.0 (2016-02-06)

- Enhancement: Stop showing the distracting loading animation ([#11](https://github.com/joeyespo/inbox-by-gmail-checker/issues/11))


#### Version 3.3.0 (2016-02-05)

- Enhancement: Add optional quite hours snooze color ([#9](https://github.com/joeyespo/inbox-by-gmail-checker/issues/9))
- Bugfix: Limit the poll input box ([#7](https://github.com/joeyespo/inbox-by-gmail-checker/issues/7))
- Bugfix: Limit the user ID's min value ([#10](https://github.com/joeyespo/inbox-by-gmail-checker/pull/10) - thanks, [@dpeukert][]!)


#### Version 3.2.0 (2015-12-18)

- Enhancement: Add polling option ([#5](https://github.com/joeyespo/grip/pull/5) - thanks, [@michliga][]!)
- Enhancement: Allow checking inbox more frequently than once per minute ([#6](https://github.com/joeyespo/grip/pull/6))
- Enhancement: Show normalized values when you save the options
- Add `CHANGES.md` and [`AUTHORS.md`](AUTHORS.md)


#### Version 3.1.0 (2015-12-11)

- Enhancement: Focus on the Inbox tab from *any* open window ([#4](https://github.com/joeyespo/grip/pull/4) - thanks, [@james0x0A][]!)


### Version 3.0.0 (2015-05-11)

- Enhancement: Add quiet hours option
- Code cleanup


### Version 2.0.0 (2014-12-16)

- Enhancement: Add options page
- Readme: Link to the Chrome Store


### Version 1.0.0 (2014-11-13)

- First public preview release


[@james0x0A]: https://github.com/james0x0A
[@michliga]: https://github.com/michliga
[@dpeukert]: https://github.com/dpeukert
[@davo11122]: https://github.com/davo11122
[@orschiro]: https://github.com/orschiro
[@shali3]: https://github.com/shali3
[@Najki]: https://github.com/Najki
[@CarlosHBC]: https://github.com/CarlosHBC
