/**
 * RehearsalPlayer
 * Controls Street View panorama playback through a sequence of decision points.
 */
const RehearsalPlayer = (() => {

  let panorama = null;
  let points = [];
  let currentIndex = 0;
  let isPlaying = false;
  let playTimer = null;
  let speed = 1;        // multiplier: 0.5, 1, 2, 0 = skip (instant)
  let onUpdate = null;  // callback when state changes
  let lastShownAt = null;

  // Base dwell time at each junction (ms) before auto-advancing
  const BASE_DWELL = 5000;
  const DECISION_DWELL_MULTIPLIER = 1.6;

  /**
   * Initialize the player with a container element and decision points.
   * @param {HTMLElement} container - DOM element for the Street View panorama
   * @param {Array} decisionPoints - from RouteAnalyzer.analyze()
   * @param {Function} updateCallback - called with state on every change
   */
  function init(container, decisionPoints, updateCallback) {
    points = decisionPoints;
    currentIndex = 0;
    isPlaying = false;
    speed = 1;
    onUpdate = updateCallback;
    lastShownAt = null;

    if (playTimer) clearTimeout(playTimer);

    panorama = new google.maps.StreetViewPanorama(container, {
      position: { lat: points[0].lat, lng: points[0].lng },
      pov: { heading: points[0].heading, pitch: 0 },
      zoom: 0,
      disableDefaultUI: true,
      showRoadLabels: true,
      motionTracking: false,
      motionTrackingControl: false,
    });

    showPoint(0);
  }

  /**
   * Show a specific decision point in the panorama.
   */
  function showPoint(index) {
    if (index < 0 || index >= points.length) return;

    recordCurrentDwell();

    currentIndex = index;
    const pt = points[index];

    panorama.setPosition({ lat: pt.lat, lng: pt.lng });
    panorama.setPov({ heading: pt.heading, pitch: 0 });
    lastShownAt = Date.now();

    emitUpdate();
  }

  /**
   * Start auto-playing through junctions.
   */
  function play() {
    if (points.length === 0) return;
    isPlaying = true;
    emitUpdate();
    scheduleNext();
  }

  /**
   * Pause auto-play.
   */
  function pause() {
    isPlaying = false;
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = null;
    }
    emitUpdate();
  }

  /**
   * Toggle play/pause.
   */
  function togglePlay() {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }

  /**
   * Go to next junction.
   */
  function next() {
    if (currentIndex < points.length - 1) {
      showPoint(currentIndex + 1);
      if (isPlaying) scheduleNext();
    } else {
      // Reached end
      recordCurrentDwell();
      pause();
    }
  }

  /**
   * Go to previous junction.
   */
  function prev() {
    if (currentIndex > 0) {
      showPoint(currentIndex - 1);
      if (isPlaying) scheduleNext();
    }
  }

  /**
   * Set playback speed.
   * @param {number} newSpeed - 0.5, 1, 2, or 0 (skip/instant)
   */
  function setSpeed(newSpeed) {
    speed = newSpeed;
    emitUpdate();

    // If playing and speed is "skip" (0), jump to next immediately
    if (isPlaying && speed === 0) {
      if (playTimer) clearTimeout(playTimer);
      next();
    }
  }

  /**
   * Jump to a specific junction by index.
   */
  function goTo(index) {
    showPoint(index);
    if (isPlaying) scheduleNext();
  }

  /**
   * Schedule the next auto-advance.
   */
  function scheduleNext() {
    if (playTimer) clearTimeout(playTimer);
    if (!isPlaying) return;
    if (currentIndex >= points.length - 1) {
      recordCurrentDwell();
      pause();
      return;
    }

    // Speed 0 = skip immediately
    if (speed === 0) {
      next();
      return;
    }

    let delay = BASE_DWELL / speed;
    const currentPoint = points[currentIndex];
    if (currentPoint && currentPoint.isDecisionPoint) {
      delay *= DECISION_DWELL_MULTIPLIER;
    }
    playTimer = setTimeout(() => {
      next();
    }, delay);
  }

  /**
   * Get current state.
   */
  function getState() {
    return {
      currentIndex,
      total: points.length,
      point: points[currentIndex] || null,
      isPlaying,
      speed,
      progress: points.length > 0 ? ((currentIndex + 1) / points.length) * 100 : 0,
      isFirst: currentIndex === 0,
      isLast: currentIndex === points.length - 1,
    };
  }

  function emitUpdate() {
    if (onUpdate) onUpdate(getState());
  }

  /**
   * Clean up.
   */
  function destroy() {
    pause();
    recordCurrentDwell();
    panorama = null;
    points = [];
    lastShownAt = null;
  }

  function recordCurrentDwell() {
    if (lastShownAt !== null && points[currentIndex]) {
      const dwellSeconds = (Date.now() - lastShownAt) / 1000;
      points[currentIndex].dwellSeconds = dwellSeconds;
    }
    lastShownAt = null;
  }

  return {
    init,
    play,
    pause,
    togglePlay,
    next,
    prev,
    setSpeed,
    goTo,
    getState,
    destroy,
  };

})();
