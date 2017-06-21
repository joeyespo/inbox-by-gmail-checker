// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// Derivative work by Joe Esposito

// Configuration
var animationFrames = 36;
var animationSpeed = 10; // ms
var canvas = document.getElementById('canvas');
var loggedInImage = document.getElementById('logged_in');
var canvasContext = canvas.getContext('2d');
var pollIntervalDefault = 3;  // 3 seconds
var pollIntervalMax = 3600;  // 1 hour
var requestTimeout = 1000 * 2;  // 2 seconds
var tryAgainTime = 1000 * 5;  // 5 seconds
var rotation = 0;
var loadingAnimation = new LoadingAnimation();
var openedLoginPage = false;
var distractionFreeMode = false;
var distractionFreeModeTimerId = null;

var options = {
  defaultUser: 0,
  pollInterval: 0,
  quietHours: [],
  distractionFreeMinutes: 30,
  useSnoozeColor: true,
  useDesktopNotifications: true,
  showPageMenu: true,
  focusExistingInboxTab: false,
  openInEmptyTab: false
};

// Legacy support for pre-event-pages
var oldChromeVersion = !chrome.runtime;
var requestTimerId;

function isQuietTime() {
  if (distractionFreeMode) {
    return true;
  }
  var time = new Date();
  return options.quietHours && options.quietHours.indexOf(time.getHours()) !== -1;
}

function getUser() {
  // Appends the /u/ route when default user is set and not equal to 0
  return options.defaultUser ? ('u/' + options.defaultUser + '/') : '';
}

function getGmailBaseUrl() {
  return 'https://mail.google.com/';
}

function getGmailUrl() {
  return getGmailBaseUrl() + 'mail/' + getUser();
}

function getInboxBaseUrl() {
  return 'https://inbox.google.com/';
}

function getInboxUrl() {
  return getInboxBaseUrl() + getUser();
}

// Identifier used to debug the possibility of multiple instances of the
// extension making requests on behalf of a single user.
function getInstanceId() {
  if (!localStorage.hasOwnProperty('instanceId'))
    localStorage.instanceId = 'gmc' + parseInt(Date.now() * Math.random(), 10);
  return localStorage.instanceId;
}

function getFeedUrl() {
  // "zx" is a Gmail query parameter that is expected to contain a random
  // string and may be ignored/stripped.
  return getGmailUrl() + 'feed/atom?zx=' + encodeURIComponent(getInstanceId());
}

function isInboxUrl(url) {
  // Return whether the URL starts with the Inbox prefix.
  return url.indexOf(getInboxBaseUrl()) === 0 ||
    url.indexOf(getGmailBaseUrl()) === 0;
}

// A "loading" animation displayed while we wait for the first response from
// Gmail. This animates the badge text with a dot that cycles from left to
// right.
function LoadingAnimation() {
  this.timerId_ = 0;
  this.maxCount_ = 8;  // Total number of states in animation
  this.current_ = 0;  // Current state
  this.maxDot_ = 4;  // Max number of dots in animation
}

LoadingAnimation.prototype.paintFrame = function () {
  var text = '';
  for (var i = 0; i < this.maxDot_; i++) {
    text += (i == this.current_) ? '.' : ' ';
  }
  if (this.current_ >= this.maxDot_)
    text += '';

  chrome.browserAction.setBadgeBackgroundColor({ color: [0, 56, 206, 255] });
  chrome.browserAction.setBadgeText({ text: text });
  this.current_++;
  if (this.current_ == this.maxCount_)
    this.current_ = 0;
}

LoadingAnimation.prototype.start = function () {
  if (this.timerId_)
    return;

  var self = this;
  this.timerId_ = window.setInterval(function () {
    self.paintFrame();
  }, 100);
}

LoadingAnimation.prototype.stop = function () {
  if (!this.timerId_)
    return;

  window.clearInterval(this.timerId_);
  this.timerId_ = 0;
}

function updateIcon() {
  if (!localStorage.hasOwnProperty('unreadCount')) {
    chrome.browserAction.setIcon({
      path: {
        '19': 'inbox_not_logged_in.png',
        '38': 'inbox_not_logged_in_retina.png'
      }
    });
    chrome.browserAction.setBadgeBackgroundColor({ color: [190, 190, 190, 230] });
    chrome.browserAction.setBadgeText({ text: '?' });
  } else {
    var quiet = isQuietTime();
    var unreadCount = localStorage.unreadCount != '0' ? localStorage.unreadCount : '';
    chrome.browserAction.setIcon({
      path: {
        '19': quiet && options.useSnoozeColor ? 'inbox_quiet.png' : 'inbox_logged_in.png',
        '38': quiet && options.useSnoozeColor ? 'inbox_quiet_retina.png' : 'inbox_logged_in_retina.png'
      }
    });
    chrome.browserAction.setBadgeBackgroundColor({ color: [0, 56, 206, 255] });
    chrome.browserAction.setBadgeText({
      text: (quiet ? '' : unreadCount)
    });
  }
}

function scheduleRequest() {
  console.log('scheduleRequest');
  var pollInterval = options.pollInterval || pollIntervalDefault;
  var multiplier = Math.pow(2, localStorage.requestFailureCount || 0);
  // Use different logic for smaller poll intervals
  if (pollInterval < 1) {
    pollInterval *= multiplier;
  } else {
    var randomness = Math.random() * 2;
    var fuzzyMultiplier = Math.max(randomness * multiplier, 1);
    pollInterval = Math.round(fuzzyMultiplier * pollInterval);
  }
  var delay = Math.min(pollInterval, pollIntervalMax);
  console.log('Scheduling for: ' + delay + ' seconds');

  if (oldChromeVersion) {
    if (requestTimerId) {
      window.clearTimeout(requestTimerId);
    }
    requestTimerId = window.setTimeout(onAlarm, delay * 1000);
  } else {
    console.log('Creating alarm');
    // Use a repeating alarm so that it fires again if there was a problem
    // setting the next alarm.
    chrome.alarms.create('refresh', {periodInMinutes: delay / 60.0});
  }
}

// ajax stuff
function startRequest(params) {
  // Schedule request immediately. We want to be sure to reschedule, even in the
  // case where the extension process shuts down while this request is
  // outstanding.
  if (params && params.scheduleRequest) scheduleRequest();

  function stopLoadingAnimation() {
    if (params && params.showLoadingAnimation) loadingAnimation.stop();
  }

  if (params && params.showLoadingAnimation)
    loadingAnimation.start();

  getInboxCount(
    function (count) {
      stopLoadingAnimation();
      updateUnreadCount(count);
      openedLoginPage = false;
    },
    function () {
      stopLoadingAnimation();
      delete localStorage.unreadCount;
      updateIcon();
    }
  );
}

function getInboxCount(onSuccess, onError) {
  var xhr = new XMLHttpRequest();
  var abortTimerId = window.setTimeout(function () {
    if (xhr) {
      xhr.abort();  // synchronously calls onreadystatechange
    }
    cleanup();
  }, requestTimeout);

  function cleanup() {
    window.clearTimeout(abortTimerId);
    xhr.onreadystatechange = null;
    xhr = null;
  }

  function handleSuccess(count) {
    cleanup();
    localStorage.requestFailureCount = 0;
    if (onSuccess) {
      onSuccess(count);
    }
  }

  var invokedErrorCallback = false;
  function handleError() {
    console.error('handleError() called');
    cleanup();
    ++localStorage.requestFailureCount;
    if (onError && !invokedErrorCallback) {
      onError();
    }
    invokedErrorCallback = true;
  }

  try {
    xhr.onreadystatechange = function () {
      if (this.readyState != 4) {
        return;
      }

      // Check for edge case where mail.google.com has not yet been visited and try again
      if (this.status === 401) {
        console.log('Got error 401 while getting inbox count');
        if (openedLoginPage) {
          console.log('Login page already opened - waiting for user to authenticate');
        } else {
          // Visit regular gmail to authorize feed access
          openedLoginPage = true;
          console.log('Opening', getGmailUrl());
          chrome.tabs.create({ url: getGmailUrl() });
        }
      } else if (this.responseXML) {
        var xmlDoc = this.responseXML;
        var fullCountSet = xmlDoc.evaluate('/gmail:feed/gmail:fullcount', xmlDoc, gmailNSResolver, XPathResult.ANY_TYPE, null);
        var fullCountNode = fullCountSet.iterateNext();
        if (fullCountNode) {
          handleSuccess(fullCountNode.textContent);
          return;
        } else {
          console.error(chrome.i18n.getMessage('gmailcheck_node_error'));
        }
      }

      handleError();
    };

    xhr.onerror = function (error) {
      handleError();
    };

    xhr.open('GET', getFeedUrl(), true);
    xhr.send(null);
  } catch(e) {
    console.error(chrome.i18n.getMessage('gmailcheck_exception', e));
    handleError();
  }
}

function gmailNSResolver(prefix) {
  if(prefix == 'gmail') {
    return 'http://purl.org/atom/ns#';
  }
}

function updateUnreadCount(count) {
  var quietTime = isQuietTime();
  var changed = localStorage.unreadCount != count || String(localStorage.quietTime) != String(quietTime);
  if (changed) {
    notify(count);
  }
  localStorage.unreadCount = count;
  localStorage.quietTime = quietTime;
  updateIcon();
  if (changed) {
    animateFlip();
  }
}


function ease(x) {
  return (1-Math.sin(Math.PI/2+x*Math.PI))/2;
}

function animateFlip() {
  rotation += 1/animationFrames;
  drawIconAtRotation();

  if (rotation <= 1) {
    setTimeout(animateFlip, animationSpeed);
  } else {
    rotation = 0;
    updateIcon();
  }
}

function drawIconAtRotation() {
  canvasContext.save();
  canvasContext.clearRect(0, 0, canvas.width, canvas.height);
  canvasContext.translate(
      Math.ceil(canvas.width/2),
      Math.ceil(canvas.height/2));
  canvasContext.rotate(2*Math.PI*ease(rotation));
  canvasContext.drawImage(loggedInImage,
      -Math.ceil(canvas.width/2),
      -Math.ceil(canvas.height/2));
  canvasContext.restore();

  chrome.browserAction.setIcon({
    imageData: canvasContext.getImageData(0, 0, canvas.width,canvas.height)
  });
}

function goToNewInbox() {
  // Navigate the empty tab if preferred, or create a new Inbox tab
  if (options.openInEmptyTab) {
    console.log('Navigating empty tab to Inbox...');
    // Check if current tab is the empty tab
    chrome.tabs.query({ currentWindow: true, active: true }, function (tabs) {
      var tab = tabs[0]
      if (tab && tab.url === 'chrome://newtab/') {
        chrome.tabs.update({ url: getInboxUrl() });
      } else {
        chrome.tabs.create({ url: getInboxUrl() });
      }
    });
  } else {
    console.log('Creating new Inbox tab...');
    chrome.tabs.create({ url: getInboxUrl() });
  }
}

function goToExistingInbox() {
  console.log('Going to inbox...');
  chrome.tabs.query({ url: '*://inbox.google.com/*', currentWindow: true }, function (tabs) {
    var tab = tabs[0];
    if (tab) {
      console.log('Found Inbox tab: ' + tab.url + '. Focusing and refreshing count...');
      chrome.tabs.update(tab.id, { selected: true, highlighted: true });
      startRequest({ scheduleRequest: false, showLoadingAnimation: false });
    } else {
      console.log('Could not find Inbox tab. Creating one...');
      goToNewInbox();
    }
  });
}

function goToInbox() {
  chrome.tabs.query({ url: '*://inbox.google.com/*', active: true, currentWindow: true }, function (tabs) {
    var tab = tabs[0];
    // Do nothing if current tab is Inbox
    var inboxUrl = getInboxUrl();
    if (tab && tab.url && tab.url.substr(0, inboxUrl.length) === inboxUrl) {
      return;
    }
    // Go to existing Inbox tab or create a new one
    if (options.focusExistingInboxTab) {
      goToExistingInbox();
    } else {
      goToNewInbox();
    }
  });

  // Clear notifications
  if (chrome.notifications && chrome.notifications.clear) {
    chrome.notifications.clear('inboxUpdate');
  }
}

function onInit() {
  console.log('onInit');
  localStorage.requestFailureCount = 0;  // used for exponential backoff
  startRequest({ scheduleRequest: true, showLoadingAnimation: true });
  if (!oldChromeVersion) {
    // TODO(mpcomplete): We should be able to remove this now, but leaving it
    // for a little while just to be sure the refresh alarm is working nicely.
    chrome.alarms.create('watchdog', { periodInMinutes: 5 });
  }
}

function onAlarm(alarm) {
  console.log('Got alarm', alarm);
  // |alarm| can be undefined because onAlarm also gets called from
  // window.setTimeout on old chrome versions.
  if (alarm && alarm.name == 'watchdog') {
    onWatchdog();
  } else {
    startRequest({ scheduleRequest: true, showLoadingAnimation: false });
  }
}

function onWatchdog() {
  chrome.alarms.get('refresh', function (alarm) {
    if (alarm) {
      console.log('Refresh alarm exists. Yay.');
    } else {
      console.log('Refresh alarm doesn\'t exist!? ' +
                  'Refreshing now and rescheduling.');
      startRequest({ scheduleRequest: true, showLoadingAnimation: false });
    }
  });
}

function onNavigate(details) {
  if (details.url && isInboxUrl(details.url)) {
    console.log('Recognized Inbox navigation to: ' + details.url + '. Refreshing count...');
    startRequest({ scheduleRequest: false, showLoadingAnimation: false });
  }
}

function onShareToInbox(info, tab) {
  chrome.tabs.create({
    url: getInboxUrl() + '?&subject=' + encodeURIComponent(tab.title) + '&body=' + encodeURIComponent(tab.url)
  });
}

function resetDistractionFreeMode() {
  // Turn off distraction-free mode, reflect this in the context menu, and clear any outstanding timers
  distractionFreeMode = false;
  chrome.contextMenus.update('distractionFreeInbox', { title: 'Go distraction-free for ' + options.distractionFreeMinutes + ' min' });
  if (distractionFreeModeTimerId) {
    window.clearTimeout(distractionFreeModeTimerId);
    distractionFreeModeTimerId = null;
  }
}

function onDistractionFreeMode(info, tab) {
  // Update distraction-free mode and reflect this in the context menu
  if (!distractionFreeMode) {
    console.log('Ending distraction-free mode in ' + options.distractionFreeMinutes + ' minutes');
    resetDistractionFreeMode();
    distractionFreeMode = true;
    chrome.contextMenus.update('distractionFreeInbox', { title: 'Leave distraction-free mode' });
    distractionFreeModeTimerId = window.setTimeout(resetDistractionFreeMode, options.distractionFreeMinutes * 60 * 1000);
  } else {
    console.log('Distraction-free mode ended');
    resetDistractionFreeMode()
  }

  refresh();
}

function onOptionsLoaded() {
  // Update distraction-free mode minutes
  if (!distractionFreeMode) {
    chrome.contextMenus.update('distractionFreeInbox', { title: 'Go distraction-free for ' + options.distractionFreeMinutes + ' min' });
  }

  // Update context menu
  var contexts = ['browser_action']
  if (options.showPageMenu) {
    contexts.push('page');
  }
  chrome.contextMenus.update('shareToInbox', { contexts: contexts });

  refresh();
}

function loadHoursList(s) {
  if (!s) {
    return [];
  }

  var hourStrings = s.split(',');
  var hours = [];
  for (var i = 0; i < hourStrings.length; i++) {
    var hour = parseInt(hourStrings[i], 10);
    if (!isNaN(hour) && hour >= 0 && hour < 24) {
      hours.push(hour);
    }
  }
  return hours;
}

function loadOptions(callback) {
  // Do nothing if storage is not permitted
  if (!chrome || !chrome.storage || !chrome.storage.sync) {
    callback(false);
    return;
  }

  // Load options from storage (with fallbacks)
  chrome.storage.sync.get({
    defaultUser: 0,
    pollInterval: 0,
    quietHours: '',
    distractionFreeMinutes: 30,
    useSnoozeColor: true,
    useDesktopNotifications: true,
    showPageMenu: true,
    focusExistingInboxTab: false,
    openInEmptyTab: false
  }, function (items) {
    options.defaultUser = items.defaultUser;
    options.pollInterval = parseInt(items.pollInterval, 10) || 0;
    options.quietHours = loadHoursList(items.quietHours);
    options.distractionFreeMinutes = parseInt(items.distractionFreeMinutes, 10) || 30;
    options.useSnoozeColor = !!items.useSnoozeColor;
    options.focusExistingInboxTab = !!items.focusExistingInboxTab;
    options.showPageMenu = !!items.showPageMenu;
    options.useDesktopNotifications = !!items.useDesktopNotifications;
    options.openInEmptyTab = !!items.openInEmptyTab;
    callback(true);
  });
}

function refresh() {
  startRequest({ scheduleRequest: true, showLoadingAnimation: false });
}

function notify(count) {
  var newMessagesCount = count - localStorage.unreadCount;

  if (options.useDesktopNotifications && !isQuietTime() && newMessagesCount > 0) {
    chrome.notifications.create('inboxUpdate', {
      type: 'basic',
      iconUrl: 'icon_256.png',
      title: 'Inbox by Gmail Checker',
      isClickable: true,
      contextMessage: 'Click to open Inbox',
      message: 'You have ' + (newMessagesCount === 1 ? 'a': newMessagesCount) +' new message' + (newMessagesCount === 1 ? '' : 's') + '.'
    });
  }
}

function main() {
  if (oldChromeVersion) {
    updateIcon();
    onInit();
  } else {
    chrome.runtime.onInstalled.addListener(onInit);
    chrome.alarms.onAlarm.addListener(onAlarm);
  }

  // Update mail count when Inbox is visited without clicking the app icon
  if (chrome.webNavigation && chrome.webNavigation.onDOMContentLoaded && chrome.webNavigation.onReferenceFragmentUpdated) {
    // NOTE: Keep this "webNavigation" code in here in case the permission is ever added back in
    //       e.g. "webNavigation" no longer shows a "Read your browsing history" permission warning, "tabs" is required
    //            again by this project, or certain "webNavigation" actions become workable without the permission
    // TODO(aa): Cannot use urlPrefix because all the url fields lack the protocol part (see crbug.com/140238)
    var filters = { url: [{ urlContains: getInboxBaseUrl().replace(/^https?\:\/\//, '') }] };
    chrome.webNavigation.onDOMContentLoaded.addListener(onNavigate, filters);
    chrome.webNavigation.onReferenceFragmentUpdated.addListener(onNavigate, filters);
  } else {
    chrome.tabs.onUpdated.addListener(function (_, details) {
      onNavigate(details);
    });
  }

  // Handle main click action
  chrome.browserAction.onClicked.addListener(goToInbox);

  // Handle notification clicks, if notifications are supported
  if (chrome.notifications && chrome.notifications.onClicked) {
    chrome.notifications.onClicked.addListener(goToInbox);
  }

  // Create context menu items
  if (chrome.contextMenus && chrome.contextMenus.create && chrome.contextMenus.onClicked) {
    chrome.contextMenus.create({ id: 'distractionFreeInbox', title: 'Go distraction-free', contexts: ['browser_action'] });
    chrome.contextMenus.create({ id: 'shareToInbox', title: 'Share page via email', contexts: ['browser_action', 'page'] });
    chrome.contextMenus.onClicked.addListener(function (info, tab) {
      if (info.menuItemId === 'shareToInbox') {
        onShareToInbox(info, tab);
      } else if (info.menuItemId === 'distractionFreeInbox') {
        onDistractionFreeMode(info, tab);
      }
    });
  }

  if (chrome.runtime && chrome.runtime.onStartup) {
    chrome.runtime.onStartup.addListener(function () {
      console.log('Starting browser... updating icon.');
      startRequest({ scheduleRequest: false, showLoadingAnimation: false });
      updateIcon();
    });
  } else {
    // This hack is needed because Chrome 22 does not persist browserAction icon
    // state, and also doesn't expose onStartup. So the icon always starts out in
    // wrong state. We don't actually use onStartup except as a clue that we're
    // in a version of Chrome that has this problem.
    chrome.windows.onCreated.addListener(function () {
      console.log('Window created... updating icon.');
      startRequest({ scheduleRequest: false, showLoadingAnimation: false });
      updateIcon();
    });
  }

  // Load options and re-load them when they're changed
  loadOptions(function () {
    onOptionsLoaded();
    chrome.storage.onChanged.addListener(function (changes, namespace) {
      loadOptions(function () {
        onOptionsLoaded();
      });
    });
  });
}

main();
