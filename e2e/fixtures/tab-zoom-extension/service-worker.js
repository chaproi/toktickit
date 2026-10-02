async function findTestedTab(targetUrl) {
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find((candidate) => candidate.url === targetUrl);
  if (tab?.id === undefined) {
    throw new Error(`Unable to locate tested tab for ${targetUrl}.`);
  }
  return tab.id;
}

globalThis.toktickitTabZoom = {
  async get(targetUrl) {
    return chrome.tabs.getZoom(await findTestedTab(targetUrl));
  },
  async set(targetUrl, zoomFactor) {
    const tabId = await findTestedTab(targetUrl);
    await chrome.tabs.setZoom(tabId, zoomFactor);
    return chrome.tabs.getZoom(tabId);
  },
};

chrome.runtime.onInstalled.addListener(() => {});
