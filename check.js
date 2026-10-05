  function resultsQRCode(pin) {
    const pinUp = String(pin || '').toUpperCase();
    // NOTE: the deployment host appears here because a QR code must encode
    // a full URL. When a dedicated public host is set up (e.g.
    // results.theidealschools.ng) only this line changes — the path stays /r/.
    const url   = window.location.origin + '/r/' + encodeURIComponent(pinUp);
    const img   = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=' +
                  encodeURIComponent(url);
    return '' +
      '<div class="rc-bottom-cell">' +
        '<div class="rc-bottom-title rc-bottom-title-blue">QR CODE</div>' +
        '<div class="rc-bottom-body rc-bottom-qr">' +
          '<img src="' + esc(img) + '" alt="QR" class="rc-qr-img">' +
          '<div class="rc-qr-caption">' + esc(pinUp) + '</div>' +
        '</div>' +
      '</div>';
  }
