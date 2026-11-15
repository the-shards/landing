// A full-page navigation (used for the download, so the browser saves the file natively). Its own module so tests can replace it.
export function go(url) {
  window.location.assign(url);
}
