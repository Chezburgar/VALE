// Vale download page: highlights the installer for the visitor's OS and fills
// in the latest release's version and file sizes from the GitHub API.
(() => {
  const REPO = 'Chezburgar/VALE';
  const LATEST = `https://github.com/${REPO}/releases/latest/download/`;

  const OS = {
    windows: { name: 'Windows', icon: '#i-windows', file: 'Vale-Setup.exe', sub: 'Windows 10 & 11 · 64-bit installer' },
    mac: { name: 'macOS', icon: '#i-apple', file: 'Vale.dmg', sub: 'Apple silicon & Intel · .dmg' },
    linux: { name: 'Linux', icon: '#i-linux', file: 'Vale.AppImage', sub: '64-bit AppImage · .deb also available' },
  };

  function detectOs() {
    const uaPlatform = navigator.userAgentData?.platform ?? '';
    const ua = navigator.userAgent;
    const platform = `${uaPlatform} ${navigator.platform ?? ''} ${ua}`;
    if (/Android|iPhone|iPad|iPod/i.test(platform)) return 'mobile';
    // iPadOS reports itself as a Mac.
    if (/Mac/i.test(platform)) return navigator.maxTouchPoints > 1 ? 'mobile' : 'mac';
    if (/Win/i.test(platform)) return 'windows';
    if (/Linux|X11|CrOS/i.test(platform)) return 'linux';
    return 'unknown';
  }

  const os = detectOs();
  document.body.dataset.os = os;

  const primary = document.getElementById('primary-download');
  const target = OS[os];
  if (target && primary) {
    primary.href = LATEST + target.file;
    primary.querySelector('use')?.setAttribute('href', target.icon);
    primary.querySelector('.btn-label').textContent = `Download for ${target.name}`;
    primary.querySelector('.btn-sub').textContent = target.sub;
    document.querySelectorAll(`.dl-card[data-os="${os}"], .help[data-os="${os}"]`).forEach((el) => el.classList.add('is-current'));
    const others = Object.keys(OS)
      .filter((k) => k !== os)
      .map((k) => OS[k].name)
      .join(' and ');
    const link = document.querySelector('#other-platforms a');
    if (link) link.textContent = `Also on ${others}`;
  } else if (os === 'mobile' && primary) {
    // Vale is a desktop app; on phones and tablets point at the download list.
    primary.querySelector('.btn-label').textContent = 'Get Vale for your PC';
    primary.querySelector('.btn-sub').textContent = 'Windows · macOS · Linux';
  }

  // Release info: version label, date and installer sizes.
  const mb = (bytes) => `${Math.round(bytes / 1e6)} MB`;
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((release) => {
      if (!release) return;
      const version = String(release.tag_name ?? '').replace(/^v/, '');
      if (version) document.querySelectorAll('[data-version]').forEach((el) => (el.textContent = version));
      if (release.published_at) {
        const date = new Date(release.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        document.querySelectorAll('[data-release-date]').forEach((el) => (el.textContent = ` · ${date}`));
      }
      for (const asset of release.assets ?? []) {
        document.querySelectorAll(`[data-size-for="${CSS.escape(asset.name)}"]`).forEach((el) => (el.textContent = mb(asset.size)));
      }
    })
    .catch(() => {
      /* offline or rate-limited: keep the version baked in at build time */
    });

  // Screenshot lightbox.
  const box = document.getElementById('lightbox');
  if (box && typeof box.showModal === 'function') {
    const img = box.querySelector('img');
    document.querySelectorAll('.shot').forEach((shot) => {
      shot.addEventListener('click', () => {
        img.src = shot.dataset.full;
        img.alt = shot.querySelector('img')?.alt ?? '';
        box.showModal();
      });
    });
    box.addEventListener('click', (e) => {
      if (e.target === box) box.close();
    });
  }
})();
