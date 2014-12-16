function saveOptions(e) {
  e.preventDefault();
  var defaultUser = document.getElementById('defaultUser').value;
  chrome.storage.sync.set({
    defaultUser: defaultUser
  }, function() {
    // Update status to let user know options were saved.
    var status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(function() {
      status.textContent = '';
    }, 3000);
  });
  return false;
}

function restoreOptions() {
  chrome.storage.sync.get({
    defaultUser: '0'
  }, function(items) {
    document.getElementById('defaultUser').value = items.defaultUser;
  });
}

function defaultOptions() {
  document.getElementById('defaultUser').value = 0;
}

function main() {
  if (!chrome || !chrome.storage || !chrome.storage.sync) {
    var status = document.getElementById('status');
    status.style.cssText = 'color:red;';
    status.textContent = 'Error: Could not load settings. Please upgrade Chrome.';
    return;
  }
  document.addEventListener('DOMContentLoaded', restoreOptions);
  document.getElementById('defaults').addEventListener('click', defaultOptions);
  document.getElementById('optionsForm').addEventListener('submit', saveOptions);
}

main();
