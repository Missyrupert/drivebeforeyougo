/**
 * RouteAnalyzer
 * Parses Google Directions API response and extracts complex junctions
 * that a driver would benefit from rehearsing.
 */
const RouteAnalyzer = (() => {

  // Maneuver types that indicate complexity
  const COMPLEX_MANEUVERS = {
    'roundabout-left':  'roundabout',
    'roundabout-right': 'roundabout',
    'merge':            'merge',
    'fork-left':        'fork',
    'fork-right':       'fork',
    'ramp-left':        'merge',
    'ramp-right':       'merge',
    'turn-sharp-left':  'sharp-turn',
    'turn-sharp-right': 'sharp-turn',
    'uturn-left':       'uturn',
    'uturn-right':      'uturn',
  };

  const ROUNDABOUT_PATTERNS = [
    /roundabout/i,
    /exit\s+the\s+roundabout/i,
    /traffic\s+circle/i,
    /gyratory/i,
    /rotary/i,
    /take\s+the\s+\d+(st|nd|rd|th)\s+exit/i,
  ];

  const LANE_COMMITMENT_PATTERNS = [
    /keep\s+left/i,
    /keep\s+right/i,
    /use\s+the\s+left\s+lane/i,
    /use\s+the\s+right\s+lane/i,
    /stay\s+in\s+the\s+left/i,
    /stay\s+in\s+the\s+right/i,
    /merge/i,
    /slip\s+road/i,
    /exit/i,
    /take\s+the\s+ramp/i,
    /keep\s+to/i,
  ];

  const PREPARE_PATTERNS = [
    /prepare/i,
    /keep/i,
    /merge/i,
    /exit/i,
    /take\s+the\s+ramp/i,
  ];

  const VISUAL_OVERLOAD_PATTERNS = [
    /signs?/i,
    /towards/i,
    /\bA\d+\b/i,
    /\bM\d+\b/i,
    /\bB\d+\b/i,
    /destination/i,
    /follow/i,
  ];

  const SOCIAL_PRESSURE_PATTERNS = [
    /city\s+centre/i,
    /airport/i,
    /hospital/i,
  ];

  // Keywords in HTML instructions that signal complexity
  const COMPLEXITY_KEYWORDS = [
    { pattern: /merge\s+onto/i,         type: 'merge' },
    { pattern: /take\s+the\s+ramp/i,    type: 'merge' },
    { pattern: /keep\s+(left|right)/i,  type: 'fork' },
    { pattern: /fork/i,                 type: 'fork' },
    { pattern: /sharp\s+(left|right)/i, type: 'sharp-turn' },
    { pattern: /u-turn/i,              type: 'uturn' },
    { pattern: /lane/i,                type: 'complex' },
    { pattern: /slip\s+road/i,         type: 'merge' },
  ];

  const SPACING_METERS = 150;
  const MIN_TARGET_POINTS = 6;
  const MAX_TARGET_POINTS = 12;
  const DECISION_SCORE_THRESHOLD = 8;

  /**
   * Analyze a Directions API route and return decision points.
   * @param {google.maps.DirectionsResult} result
   * @returns {Array<DecisionPoint>}
   */
  function analyze(result) {
    if (!result || !result.routes || !result.routes.length) {
      return [];
    }

    const route = result.routes[0];
    const flatSteps = flattenSteps(route);
    const scoredSteps = scoreSteps(flatSteps);
    const selectedSteps = selectRehearsalSteps(scoredSteps, route);

    return selectedSteps.map((step, idx) => ({
      index: idx,
      stepIndex: step.stepIndex,
      legIndex: step.legIndex,
      lat: step.lat,
      lng: step.lng,
      heading: step.heading,
      instruction: step.instruction,
      type: step.type,
      typeLabel: formatTypeLabel(step.type),
      isPrimary: Boolean(step.isPrimary),
      isLeadIn: Boolean(step.isLeadIn),
      isDecisionPoint: step.score >= DECISION_SCORE_THRESHOLD,
      commitmentLevel: getCommitmentLevel(step),
      score: step.score,
      reasons: step.reasons,
      distanceMeters: step.distanceMeters,
      distance: step.distanceText,
      maneuver: step.maneuver || null,
    }));
  }

  function getCommitmentLevel(step) {
    const reasons = Array.isArray(step.reasons) ? step.reasons : [];
    const hasLaneCommitment = reasons.includes('lane-commitment');
    const hasShortWindow = reasons.includes('short-window');
    const hasRoundaboutExit = reasons.includes('roundabout-exit');

    if ((hasLaneCommitment && hasShortWindow) ||
        (hasRoundaboutExit && hasLaneCommitment)) {
      return 'high';
    }
    if (hasLaneCommitment || hasShortWindow || hasRoundaboutExit) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Flatten Directions legs into a single step list.
   */
  function flattenSteps(route) {
    const flat = [];
    let orderIndex = 0;
    route.legs.forEach((leg, legIndex) => {
      leg.steps.forEach((step, stepIndex) => {
        const heading = computeHeading(step.start_location, step.end_location);
        const instructionHtml = step.instructions || '';
        const instructionText = stripHtml(instructionHtml);
        flat.push({
          orderIndex,
          legIndex,
          stepIndex,
          step,
          heading,
          lat: step.start_location.lat(),
          lng: step.start_location.lng(),
          instructionHtml,
          instruction: instructionText,
          distanceMeters: step.distance ? step.distance.value : 0,
          distanceText: step.distance ? step.distance.text : '',
          maneuver: step.maneuver || null,
        });
        orderIndex += 1;
      });
    });
    return flat;
  }

  /**
   * Score each step for rehearsal-worthiness.
   */
  function scoreSteps(steps) {
    return steps.map((entry, idx) => {
      const next = steps[idx + 1] || null;
      const prev = steps[idx - 1] || null;
      const scored = scoreStep(entry, { next, prev });
      return { ...entry, ...scored };
    });
  }

  function scoreStep(entry, context) {
    const instruction = entry.instruction || '';
    const instructionHtml = entry.instructionHtml || '';
    const lower = instruction.toLowerCase();
    const reasons = [];
    let score = 0;

    if (isMotorwayCruise(lower)) {
      return { score: 0, reasons: ['motorway-cruise'], exclude: true, type: deriveType(entry.step, instructionHtml), isPrimary: false };
    }

    if (matchesAny(LANE_COMMITMENT_PATTERNS, lower)) {
      score += 6;
      reasons.push('lane-commitment');
    }

    const isRoundabout = isRoundaboutStep(entry.step, instructionHtml);
    if (isRoundabout) {
      score += 4;
      reasons.push('roundabout');
      if (hasExitOrdinal(lower)) {
        score += 2;
        reasons.push('roundabout-exit');
      } else if (entry.distanceMeters > 0 && entry.distanceMeters < 120) {
        score -= 3;
        reasons.push('small-roundabout');
      }
    }

    if (context && context.next && isPrepareStep(lower) && isMajorManeuver(context.next.step)) {
      const nextDistance = context.next.distanceMeters || 0;
      if (nextDistance > 0 && nextDistance <= 120) {
        score += 6;
        reasons.push('short-window');
      } else if (nextDistance > 0 && nextDistance <= 250) {
        score += 4;
        reasons.push('short-window');
      }
    }

    if (matchesAny(VISUAL_OVERLOAD_PATTERNS, instructionHtml) || matchesAny(VISUAL_OVERLOAD_PATTERNS, lower)) {
      score += 2;
      reasons.push('signage');
    }

    if (matchesAny(SOCIAL_PRESSURE_PATTERNS, lower)) {
      score += 1;
      reasons.push('pressure');
    }

    if (!hasComplexitySignal(entry.step, instructionHtml) && score === 0) {
      return { score: 0, reasons, exclude: true, type: deriveType(entry.step, instructionHtml), isPrimary: false };
    }

    const type = deriveType(entry.step, instructionHtml);
    return { score, reasons, exclude: false, type, isPrimary: isRoundabout };
  }

  function selectRehearsalSteps(steps, route) {
    const target = getTargetCount(route);
    const candidates = steps.filter(step => step.score > 0 && !step.exclude);
    const sorted = [...candidates].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.orderIndex - b.orderIndex;
    });

    const selectedMain = [];
    for (const candidate of sorted) {
      if (selectedMain.length >= target) break;
      if (isTooClose(candidate, selectedMain, SPACING_METERS)) continue;
      selectedMain.push(candidate);
    }

    const selected = new Map();
    selectedMain.forEach(step => selected.set(step.orderIndex, { ...step, isLeadIn: false }));

    selectedMain.forEach(step => {
      const leadIn = getLeadInStep(step, steps);
      if (!leadIn) return;
      if (!selected.has(leadIn.orderIndex)) {
        selected.set(leadIn.orderIndex, {
          ...leadIn,
          isLeadIn: true,
          reasons: [...leadIn.reasons, 'lead-in'],
        });
      }
    });

    let result = Array.from(selected.values()).sort((a, b) => a.orderIndex - b.orderIndex);
    if (result.length > MAX_TARGET_POINTS) {
      result = trimToMaxPoints(result);
    }
    return result;
  }

  function getLeadInStep(step, steps) {
    const prev = steps[step.orderIndex - 1];
    if (!prev) return null;
    if (prev.distanceMeters > 40 || isPrepareStep(prev.instruction.toLowerCase())) {
      return prev;
    }
    return null;
  }

  function trimToMaxPoints(points) {
    let result = [...points];
    const leadIns = result.filter(pt => pt.isLeadIn).sort((a, b) => a.score - b.score);
    while (result.length > MAX_TARGET_POINTS && leadIns.length) {
      const toRemove = leadIns.shift();
      result = result.filter(pt => pt.orderIndex !== toRemove.orderIndex);
    }
    if (result.length > MAX_TARGET_POINTS) {
      const nonLead = result.filter(pt => !pt.isLeadIn).sort((a, b) => a.score - b.score);
      while (result.length > MAX_TARGET_POINTS && nonLead.length) {
        const toRemove = nonLead.shift();
        result = result.filter(pt => pt.orderIndex !== toRemove.orderIndex);
      }
    }
    return result.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  function isTooClose(candidate, selected, thresholdMeters) {
    return selected.some(existing => {
      const dist = haversineDistance(candidate.lat, candidate.lng, existing.lat, existing.lng);
      return dist < thresholdMeters;
    });
  }

  function getTargetCount(route) {
    let totalMeters = 0;
    route.legs.forEach(leg => {
      if (leg.distance && typeof leg.distance.value === 'number') {
        totalMeters += leg.distance.value;
      }
    });
    if (!totalMeters) return 8;
    const totalKm = totalMeters / 1000;
    const target = Math.round(totalKm / 7) + 5;
    return clamp(target, MIN_TARGET_POINTS, MAX_TARGET_POINTS);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function deriveType(step, instructionHtml) {
    if (isRoundaboutStep(step, instructionHtml)) return 'roundabout';
    if (step.maneuver && COMPLEX_MANEUVERS[step.maneuver]) {
      return COMPLEX_MANEUVERS[step.maneuver];
    }
    for (const kw of COMPLEXITY_KEYWORDS) {
      if (kw.pattern.test(instructionHtml)) {
        return kw.type;
      }
    }
    return 'complex';
  }
  }

  function isRoundaboutStep(step, instructionHtml) {
    const instruction = instructionHtml || step.instructions || '';
    if (step.maneuver && COMPLEX_MANEUVERS[step.maneuver] === 'roundabout') {
      return true;
    }
    return ROUNDABOUT_PATTERNS.some(pattern => pattern.test(instruction));
  }

  function hasComplexitySignal(step, instructionHtml) {
    const instruction = instructionHtml || step.instructions || '';
    return COMPLEXITY_KEYWORDS.some(kw => kw.pattern.test(instruction)) ||
      ROUNDABOUT_PATTERNS.some(pattern => pattern.test(instruction)) ||
      LANE_COMMITMENT_PATTERNS.some(pattern => pattern.test(instruction));
  }

  function isPrepareStep(instruction) {
    return PREPARE_PATTERNS.some(pattern => pattern.test(instruction));
  }

  function isMajorManeuver(step) {
    if (!step) return false;
    if (step.maneuver && COMPLEX_MANEUVERS[step.maneuver]) return true;
    if (step.maneuver && (step.maneuver === 'turn-left' || step.maneuver === 'turn-right')) return true;
    return hasComplexitySignal(step, step.instructions || '');
  }

  function matchesAny(patterns, text) {
    return patterns.some(pattern => pattern.test(text));
  }

  function hasExitOrdinal(instruction) {
    return /(\d+)(st|nd|rd|th)\s+exit/i.test(instruction);
  }

  function isMotorwayCruise(instruction) {
    const isCruise = /continue\s+on\s+[am]\d+/i.test(instruction) ||
      /continue\s+for\s+\d+/i.test(instruction) ||
      /continue\s+straight/i.test(instruction);
    const hasLaneCue = matchesAny(LANE_COMMITMENT_PATTERNS, instruction) ||
      /exit/i.test(instruction) ||
      /merge/i.test(instruction);
    return isCruise && !hasLaneCue;
  }

  /**
   * Compute bearing from point A to point B.
   */
  function computeHeading(from, to) {
    if (typeof google !== 'undefined' && google.maps && google.maps.geometry) {
      return google.maps.geometry.spherical.computeHeading(from, to);
    }
    // Fallback manual calculation
    const lat1 = toRad(from.lat());
    const lat2 = toRad(to.lat());
    const dLng = toRad(to.lng() - from.lng());
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function toRad(deg) { return deg * Math.PI / 180; }
  function toDeg(rad) { return rad * 180 / Math.PI; }

  /**
   * Remove HTML tags from a string.
   */
  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  /**
   * Format type slug into readable label.
   */
  function formatTypeLabel(type) {
    const labels = {
      'roundabout':  'Roundabout',
      'merge':       'Merge',
      'fork':        'Fork / Lane Split',
      'sharp-turn':  'Sharp Turn',
      'uturn':       'U-Turn',
      'complex':     'Tricky Junction',
    };
    return labels[type] || 'Junction';
  }

  /**
   * Haversine distance in meters.
   */
  function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  return { analyze };

})();
