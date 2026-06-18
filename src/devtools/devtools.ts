import browser from 'webextension-polyfill';

void browser.devtools.panels.create('ReqHook', '', browser.runtime.getURL('src/devtools/panel.html'));
