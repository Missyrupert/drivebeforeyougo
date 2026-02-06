/**
 * DriveBeforeYouGo — Main Application
 * Orchestrates: API key management, Places Autocomplete, Directions,
 * Route Analysis, and Rehearsal Player.
 */
(function () {
  'use strict';

  // ---- DOM refs ----
  const inputScreen   = document.getElementById('input-screen');
  const loadingScreen = document.getElementById('loading-screen');
  const playerScreen  = document.getElementById('player-screen');
  const loadingMsg    = document.getElementById('loading-msg');

  const journeyForm       = document.getElementById('journey-form');
  const originContainer   = document.getElementById('origin-container');
  const destContainer     = document.getElementById('dest-container');
  const swapBtn           = document.getElementById('swap-btn');
  const findBtn           = document.getElementById('find-btn');
  const inputError        = document.getElementById('input-error');
  const landingCta        = document.getElementById('landing-cta');

  const backBtn           = document.getElementById('back-btn');
  const routeSummaryText  = document.getElementById('route-summary-text');
  const junctionOverview  = document.getElementById('junction-overview');
  const junctionTotal     = document.getElementById('junction-total');
  const roundaboutTotal   = document.getElementById('roundabout-total');
  const junctionList      = document.getElementById('junction-list');
  const startRehearsalBtn = document.getElementById('start-rehearsal-btn');
  const debugPanel        = document.getElementById('debug-panel');

  const rehearsalView      = document.getElementById('rehearsal-view');
  const streetviewContainer = document.getElementById('streetview-container');
  const junctionBadge      = document.getElementById('junction-badge');
  const junctionDescription = document.getElementById('junction-description');
  const junctionTypeTag    = document.getElementById('junction-type-tag');
  const decisionLabel      = document.getElementById('decision-label');
  const prevBtn            = document.getElementById('prev-btn');
  const playPauseBtn       = document.getElementById('play-pause-btn');
  const nextBtn            = document.getElementById('next-btn');
  const speedBtns          = document.querySelectorAll('.speed-btn');
  const progressBar        = document.getElementById('progress-bar');

  // ---- State ----
  const API_KEY_STORAGE = 'drivebeforeyougo_api_key';
  const debugMode = new URLSearchParams(window.location.search).get('debug') === '1';
  let directionsService = null;
  let decisionPoints = [];
  let originPlace = null;
  let destPlace = null;
  let rehearsalCompleted = false;
  let lingeredSnapshot = null;

  // ---- Boot ----
  boot();

  function boot() {
    registerServiceWorker();
    const apiKey = localStorage.getItem(API_KEY_STORAGE);
    if (apiKey) {
      loadGoogleMaps(apiKey);
    } else {
      showApiKeyPrompt();
    }
  }

  // ---- API Key Prompt ----
  function showApiKeyPrompt() {
    const prompt = document.createElement('div');
    prompt.className = 'api-key-prompt';
    prompt.id = 'api-key-prompt';
    prompt.innerHTML = `
      <h2>Google Maps API Key</h2>
      <p>To use DriveBeforeYouGo you need a Google Maps API key with Directions, Street View, Places, and Maps JS APIs enabled.
         <a href="https://console.cloud.google.com/apis/credentials" target="_blank">Get one here</a>.</p>
      <input type="text" id="api-key-input" placeholder="Paste your API key">
      <button class="btn-primary" id="save-key-btn">Save & Continue</button>
    `;
    inputScreen.appendChild(prompt);
    findBtn.disabled = true;

    document.getElementById('save-key-btn').addEventListener('click', () => {
      const key = document.getElementById('api-key-input').value.trim();
      if (!key) return;
      localStorage.setItem(API_KEY_STORAGE, key);
      prompt.remove();
      findBtn.disabled = false;
      loadGoogleMaps(key);
    });
  }

  // ---- Load Google Maps JS API (async pattern) ----
  function loadGoogleMaps(apiKey) {
    if (window.google && window.google.maps && window.google.maps.importLibrary) {
      onMapsReady();
      return;
    }

    // Bootstrap the async loader as recommended by Google
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&libraries=places,geometry&callback=_mapsReady`;
    script.async = true;
    script.onerror = () => {
      showError('Failed to load Google Maps. Check your API key and try again.');
      localStorage.removeItem(API_KEY_STORAGE);
    };

    window._mapsReady = function () {
      delete window._mapsReady;
      onMapsReady();
    };

    document.head.appendChild(script);
  }

  async function onMapsReady() {
    // Import libraries explicitly (new pattern)
    await google.maps.importLibrary('places');
    await google.maps.importLibrary('geometry');

    directionsService = new google.maps.DirectionsService();
    setupAutocomplete();
    bindEvents();
  }

  // ---- Places Autocomplete (new PlaceAutocompleteElement API) ----
  function setupAutocomplete() {
    // Origin autocomplete
    const originAC = new google.maps.places.PlaceAutocompleteElement();
    originAC.id = 'origin-autocomplete';
    originContainer.appendChild(originAC);

    originAC.addEventListener('gmp-placeselect', async (event) => {
      const place = event.place;
      await place.fetchFields({ fields: ['displayName', 'formattedAddress'] });
      originPlace = place.formattedAddress || place.displayName;
    });

    // Destination autocomplete
    const destAC = new google.maps.places.PlaceAutocompleteElement();
    destAC.id = 'dest-autocomplete';
    destContainer.appendChild(destAC);

    destAC.addEventListener('gmp-placeselect', async (event) => {
      const place = event.place;
      await place.fetchFields({ fields: ['displayName', 'formattedAddress'] });
      destPlace = place.formattedAddress || place.displayName;
    });
  }

  // ---- Events ----
  function bindEvents() {
    journeyForm.addEventListener('submit', onSubmitJourney);
    swapBtn.addEventListener('click', onSwap);
    backBtn.addEventListener('click', goBackToInput);
    startRehearsalBtn.addEventListener('click', startRehearsal);
    if (landingCta) {
      landingCta.addEventListener('click', scrollToForm);
    }

    prevBtn.addEventListener('click', () => RehearsalPlayer.prev());
    nextBtn.addEventListener('click', () => RehearsalPlayer.next());
    playPauseBtn.addEventListener('click', () => RehearsalPlayer.togglePlay());

    speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const spd = parseFloat(btn.dataset.speed);
        RehearsalPlayer.setSpeed(spd);
        speedBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  function onSwap() {
    const tmp = originPlace;
    originPlace = destPlace;
    destPlace = tmp;
    // Swap the visual inputs too — need to recreate since PlaceAutocompleteElement
    // doesn't expose a setter. Swap the container children.
    const originChild = originContainer.querySelector('gmp-place-autocomplete');
    const destChild = destContainer.querySelector('gmp-place-autocomplete');
    if (originChild && destChild) {
      originContainer.appendChild(destChild);
      destContainer.appendChild(originChild);
    }
  }

  // ---- Journey Submission ----
  function onSubmitJourney(e) {
    e.preventDefault();
    hideError();

    // Get text from the PlaceAutocompleteElement inputs as fallback
    const originEl = originContainer.querySelector('gmp-place-autocomplete');
    const destEl = destContainer.querySelector('gmp-place-autocomplete');

    // Use selected place or fall back to whatever was typed
    const origin = originPlace || (originEl && originEl.value) || '';
    const dest = destPlace || (destEl && destEl.value) || '';

    if (!origin || !dest) {
      showError('Please select both a start and destination from the suggestions.');
      return;
    }

    showScreen('loading');
    setLoading('Planning your route...');

    directionsService.route({
      origin: origin,
      destination: dest,
      travelMode: google.maps.TravelMode.DRIVING,
      provideRouteAlternatives: false,
    }).then(
      function (result) { onDirectionsResult(result, 'OK'); },
      function (err) {
        console.error('Directions error:', err);
        showScreen('input');
        showError('Could not find a route: ' + (err.code || err.message || err) + '. Check your locations and try again.');
      }
    );
  }

  function onDirectionsResult(result, status) {
    if (status !== 'OK') {
      showScreen('input');
      showError('Could not find a route: ' + status + '. Check your locations and try again.');
      return;
    }

    setLoading('Analyzing junctions...');

    setTimeout(() => {
      const route = result.routes[0];
      decisionPoints = RouteAnalyzer.analyze(result);

      if (decisionPoints.length === 0) {
        showScreen('input');
        showError('No complex junctions found on this route. It looks like a straightforward drive!');
        return;
      }

      renderJunctionOverview(decisionPoints, route);
      showScreen('player');
    }, 300);
  }

  // ---- Junction Overview ----
  function renderJunctionOverview(points, route) {
    routeSummaryText.textContent = formatRouteSummary(route);

    junctionTotal.textContent = points.length;
    roundaboutTotal.textContent = points.filter(pt => pt.type === 'roundabout').length;
    junctionList.innerHTML = '';

    points.forEach((pt, i) => {
      const card = document.createElement('div');
      card.className = 'junction-card';
      card.addEventListener('click', () => {
        startRehearsal(i);
      });

      card.innerHTML =
        '<div class="num">' + (i + 1) + '</div>' +
        '<div class="details">' +
          '<div class="instruction">' + pt.instruction + '</div>' +
          '<span class="type-tag ' + pt.type + '">' + pt.typeLabel + '</span>' +
        '</div>';
      junctionList.appendChild(card);
    });

    junctionOverview.hidden = false;
    rehearsalView.hidden = true;

    renderDebugPanel(points, false);
  }

  function formatRouteSummary(route) {
    if (!route || !route.legs || route.legs.length === 0) return '';
    const firstLeg = route.legs[0];
    const lastLeg = route.legs[route.legs.length - 1];
    const start = (firstLeg.start_address || '').split(',')[0];
    const end = (lastLeg.end_address || '').split(',')[0];

    let totalDistance = 0;
    let totalDuration = 0;
    route.legs.forEach(leg => {
      if (leg.distance && typeof leg.distance.value === 'number') {
        totalDistance += leg.distance.value;
      }
      if (leg.duration && typeof leg.duration.value === 'number') {
        totalDuration += leg.duration.value;
      }
    });

    return `${start} → ${end} · ${formatDistance(totalDistance)} · ${formatDuration(totalDuration)}`;
  }

  function formatDistance(meters) {
    if (!meters || meters <= 0) return '';
    if (meters >= 10000) return `${Math.round(meters / 1000)} km`;
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    return `${Math.round(meters)} m`;
  }

  function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '';
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
  }

  // ---- Start Rehearsal ----
  function startRehearsal(startIndex) {
    const idx = typeof startIndex === 'number' ? startIndex : 0;
    rehearsalCompleted = false;
    lingeredSnapshot = null;

    junctionOverview.hidden = true;
    rehearsalView.hidden = false;

    RehearsalPlayer.init(streetviewContainer, decisionPoints, onPlayerUpdate);

    if (idx > 0) {
      RehearsalPlayer.goTo(idx);
    }
  }

  // ---- Player UI Updates ----
  function onPlayerUpdate(state) {
    junctionBadge.textContent = (state.currentIndex + 1) + ' / ' + state.total;
    junctionDescription.textContent = state.point ? state.point.instruction : '';

    if (state.point) {
      junctionTypeTag.textContent = state.point.typeLabel;
      junctionTypeTag.className = 'junction-type-tag type-tag ' + state.point.type;
      decisionLabel.hidden = !state.point.isDecisionPoint;
    } else {
      decisionLabel.hidden = true;
    }

    progressBar.style.width = state.progress + '%';

    if (state.isPlaying) {
      playPauseBtn.innerHTML = '&#9646;&#9646;';
      playPauseBtn.classList.add('playing');
    } else {
      playPauseBtn.innerHTML = '&#9654;';
      playPauseBtn.classList.remove('playing');
    }

    prevBtn.disabled = state.isFirst;
    nextBtn.disabled = state.isLast;

    if (!rehearsalCompleted && state.isLast && !state.isPlaying) {
      rehearsalCompleted = true;
      lingeredSnapshot = getMostLingered(decisionPoints);
    }

    if (debugMode) {
      renderDebugPanel(decisionPoints, rehearsalCompleted);
    }
  }

  // ---- Navigation ----
  function goBackToInput() {
    RehearsalPlayer.destroy();
    rehearsalView.hidden = true;
    junctionOverview.hidden = false;
    rehearsalCompleted = false;
    lingeredSnapshot = null;
    // Reset selected places for next search
    originPlace = null;
    destPlace = null;
    showScreen('input');
  }

  function showScreen(name) {
    inputScreen.classList.remove('active');
    loadingScreen.classList.remove('active');
    playerScreen.classList.remove('active');

    switch (name) {
      case 'input':   inputScreen.classList.add('active'); break;
      case 'loading': loadingScreen.classList.add('active'); break;
      case 'player':  playerScreen.classList.add('active'); break;
    }
  }

  // ---- Helpers ----
  function setLoading(msg) {
    loadingMsg.textContent = msg;
  }

  function showError(msg) {
    inputError.textContent = msg;
    inputError.hidden = false;
  }

  function hideError() {
    inputError.hidden = true;
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  function renderDebugPanel(points, completed) {
    if (!debugMode) {
      debugPanel.hidden = true;
      debugPanel.textContent = '';
      return;
    }

    debugPanel.hidden = false;
    const rows = points.map((pt, i) => {
      const reasons = Array.isArray(pt.reasons) ? pt.reasons.join(', ') : '';
      const distance = typeof pt.distanceMeters === 'number' && pt.distanceMeters > 0
        ? `${Math.round(pt.distanceMeters)} m`
        : (pt.distance || 'n/a');
      const instruction = truncateText(pt.instruction || '', 90);
      const commitment = pt.commitmentLevel || 'low';
      const dwellSeconds = typeof pt.dwellSeconds === 'number'
        ? `${Math.round(pt.dwellSeconds)}s`
        : '0s';
      return `${i + 1}. leg ${pt.legIndex} step ${pt.stepIndex} · ${distance} · score ${pt.score} · ${commitment} · dwell ${dwellSeconds} · ${reasons} · ${instruction}`;
    });

    if (completed && Array.isArray(lingeredSnapshot) && lingeredSnapshot.length) {
      rows.push('');
      rows.push('Most lingered moments');
      lingeredSnapshot.forEach((pt, idx) => {
        const dwellSeconds = typeof pt.dwellSeconds === 'number'
          ? `${Math.round(pt.dwellSeconds)}s`
          : '0s';
        const instruction = truncateText(pt.instruction || '', 90);
        const stressScore = typeof pt.stressScore === 'number'
          ? pt.stressScore.toFixed(1)
          : '0.0';
        rows.push(`${idx + 1}. #${pt.index + 1} · ${pt.commitmentLevel || 'low'} · ${dwellSeconds} · ${stressScore} · ${instruction}`);
      });
    }

    debugPanel.textContent = rows.join('\n');
  }

  function getMostLingered(points) {
    const weights = { low: 1, medium: 1.5, high: 2 };
    return points
      .map(pt => {
        const dwell = typeof pt.dwellSeconds === 'number' ? pt.dwellSeconds : 0;
        const weight = weights[pt.commitmentLevel] || 1;
        return { ...pt, stressScore: dwell * weight };
      })
      .sort((a, b) => b.stressScore - a.stressScore)
      .slice(0, 3);
  }

  function scrollToForm() {
    journeyForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      const originEl = originContainer.querySelector('gmp-place-autocomplete');
      if (originEl && typeof originEl.focus === 'function') {
        originEl.focus();
      }
    }, 250);
  }

  function truncateText(text, maxLen) {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 1) + '…';
  }

})();
