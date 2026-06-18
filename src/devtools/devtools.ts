import browser from 'webextension-polyfill';

void browser.devtools.panels.create('ReqHook', '', 'src/devtools/panel.html');
