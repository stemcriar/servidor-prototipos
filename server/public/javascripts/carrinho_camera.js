var CameraControl = (function () {
  // =====================================================================================
  // DOM & STATE
  // =====================================================================================
  var handsInstance = null;
  var videoEl = null;
  var canvasEl = null;
  var ctx = null;
  var modalEl = null;
  var loadingEl = null;

  var isActive = false;
  var isModelReady = false;
  var cameraStream = null;
  var animFrameId = null;
  var gameLoopId = null;

  // =====================================================================================
  // CONSTANTS
  // =====================================================================================
  var GAME_LOOP_MS = 50;
  var DEBOUNCE_FRAMES = 3;
  var MAX_SPEED = 100;

  // Colors from project palette
  var COLOR_BLUE = "#014D8F";
  var COLOR_ORANGE = "#FFA200";
  var COLOR_GREEN = "#68AB30";

  // =====================================================================================
  // DIRECTION STATE
  // =====================================================================================
  var currentDirection = null; // 'up', 'down', 'left', 'right', or null
  var pendingDirection = null;
  var directionDebounce = 0;
  var hasSentStop = true;

  // Direction to angle mapping (matches joystick angle convention and motor controller ranges)
  // Right=0, Up-Right=45, Up=90, Up-Left=135, Left=180, Down-Left=225, Down=270, Down-Right=315
  var DIRECTION_CONFIG = {
    "up":         { angle: 90,  label: "Frente",          arrow: "\u25B2", color: COLOR_GREEN },
    "down":       { angle: 270, label: "R\u00E9",              arrow: "\u25BC", color: COLOR_ORANGE },
    "left":       { angle: 180, label: "Esquerda",        arrow: "\u25C0", color: COLOR_BLUE },
    "right":      { angle: 0,   label: "Direita",         arrow: "\u25B6", color: COLOR_BLUE },
    "up-right":   { angle: 45,  label: "Frente Direita",  arrow: "\u2197", color: COLOR_GREEN },
    "up-left":    { angle: 135, label: "Frente Esquerda", arrow: "\u2196", color: COLOR_GREEN },
    "down-right": { angle: 315, label: "R\u00E9 Direita",      arrow: "\u2198", color: COLOR_ORANGE },
    "down-left":  { angle: 225, label: "R\u00E9 Esquerda",     arrow: "\u2199", color: COLOR_ORANGE }
  };

  // =====================================================================================
  // FINGER DETECTION UTILS
  // =====================================================================================
  function isFingerExtended(landmarks, tipIdx, pipIdx) {
    var wrist = landmarks[0];
    var tip = landmarks[tipIdx];
    var pip = landmarks[pipIdx];
    var distTip = Math.sqrt(
      Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2)
    );
    var distPip = Math.sqrt(
      Math.pow(pip.x - wrist.x, 2) + Math.pow(pip.y - wrist.y, 2)
    );
    return distTip > distPip;
  }

  // 8 directions ordered by angle sector index (0°, 45°, 90°, ... , 315°)
  var DIRECTION_SECTORS = ["right", "up-right", "up", "up-left", "left", "down-left", "down", "down-right"];

  function detectPointingDirection(mirrored) {
    // Check if index finger is extended
    var indexExtended = isFingerExtended(mirrored, 8, 6);
    if (!indexExtended) return null;

    // Check if other fingers are also extended (open hand = not pointing)
    var middleExtended = isFingerExtended(mirrored, 12, 10);
    var ringExtended   = isFingerExtended(mirrored, 16, 14);
    var pinkyExtended  = isFingerExtended(mirrored, 20, 18);

    var othersCount =
      (middleExtended ? 1 : 0) +
      (ringExtended   ? 1 : 0) +
      (pinkyExtended  ? 1 : 0);

    if (othersCount >= 2) return null; // Open hand — stop

    // Direction vector from MCP (landmark 5) to fingertip (landmark 8)
    var mcp = mirrored[5];
    var tip = mirrored[8];
    var dx = tip.x - mcp.x;
    var dy = tip.y - mcp.y;

    // Calculate angle using same convention as the joystick:
    // atan2(dy, dx) then convert so Right=0, Up=90, Left=180, Down=270
    var rawAngle = Math.atan2(dy, dx);
    var angleDeg;
    if (rawAngle < 0) {
      angleDeg = Math.round((-rawAngle * 180) / Math.PI);
    } else {
      angleDeg = Math.round(360 - (rawAngle * 180) / Math.PI);
    }

    // Discretize into 8 sectors of 45° each
    // Shift by 22.5° so each sector is centered on its cardinal/diagonal angle
    var sectorIndex = Math.floor(((angleDeg + 22.5) % 360) / 45);
    return DIRECTION_SECTORS[sectorIndex];
  }

  // =====================================================================================
  // DRAW DIRECTION ARROW OVERLAY
  // =====================================================================================
  function drawDirectionOverlay(direction) {
    var cw = canvasEl.width;
    var ch = canvasEl.height;
    var centerX = cw / 2;
    var centerY = ch / 2;
    var arrowSize = Math.min(cw, ch) * 0.12;

    ctx.save();

    if (direction) {
      var cfg = DIRECTION_CONFIG[direction];

      // Background circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, arrowSize * 1.3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fill();
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Arrow character
      ctx.fillStyle = cfg.color;
      ctx.font = "bold " + Math.round(arrowSize) + "px Rubik, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(cfg.arrow, centerX, centerY);

      // Label below
      var fontSize = Math.round(arrowSize * 0.35);
      var labelY = centerY + arrowSize * 1.3 + 25;
      ctx.font = "bold " + fontSize + "px Rubik, sans-serif";
      var textWidth = ctx.measureText(cfg.label).width;

      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.beginPath();
      ctx.roundRect(
        centerX - textWidth / 2 - 12,
        labelY - fontSize / 2 - 6,
        textWidth + 24,
        fontSize + 12,
        8
      );
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(cfg.label, centerX, labelY);
    } else {
      // Stop indicator
      ctx.beginPath();
      ctx.arc(centerX, centerY, arrowSize * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.30)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Stop icon (square)
      var sqSize = arrowSize * 0.35;
      ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
      ctx.fillRect(centerX - sqSize / 2, centerY - sqSize / 2, sqSize, sqSize);

      // Label
      var fontSize = Math.round(arrowSize * 0.3);
      var labelY = centerY + arrowSize * 0.9 + 22;
      ctx.font = "bold " + fontSize + "px Rubik, sans-serif";
      var stopText = "Parado";
      var textWidth = ctx.measureText(stopText).width;

      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.beginPath();
      ctx.roundRect(
        centerX - textWidth / 2 - 10,
        labelY - fontSize / 2 - 5,
        textWidth + 20,
        fontSize + 10,
        6
      );
      ctx.fill();

      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(stopText, centerX, labelY);
    }

    ctx.restore();
  }

  // =====================================================================================
  // DRAW FINGERTIP HIGHLIGHT
  // =====================================================================================
  function drawFingertip(px, py, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // =====================================================================================
  // MEDIAPIPE HANDS INIT
  // =====================================================================================
  function cacheDOM() {
    videoEl   = document.getElementById("camera-video");
    canvasEl  = document.getElementById("camera-canvas");
    ctx       = canvasEl.getContext("2d");
    modalEl   = document.getElementById("camera-modal");
    loadingEl = document.getElementById("camera-loading");
  }

  async function initHands() {
    if (isModelReady) return;

    // Wait for CDN scripts to load
    if (typeof Hands === "undefined" || typeof drawLandmarks === "undefined") {
      await new Promise(function (resolve) {
        var check = setInterval(function () {
          if (typeof Hands !== "undefined" && typeof drawLandmarks !== "undefined") {
            clearInterval(check);
            resolve();
          }
        }, 200);
      });
    }

    handsInstance = new Hands({
      locateFile: function (file) {
        return "https://cdn.jsdelivr.net/npm/@mediapipe/hands/" + file;
      },
    });

    handsInstance.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.5,
    });

    handsInstance.onResults(onHandsResults);
    isModelReady = true;
  }

  // =====================================================================================
  // CAMERA STREAM
  // =====================================================================================
  async function startCameraStream() {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });
    videoEl.srcObject = cameraStream;
    return new Promise(function (resolve) {
      videoEl.onloadedmetadata = function () {
        videoEl.play();
        canvasEl.width  = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
        resolve();
      };
    });
  }

  function stopCameraStream() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach(function (t) { t.stop(); });
      cameraStream = null;
    }
    if (videoEl) videoEl.srcObject = null;
  }

  // =====================================================================================
  // FRAME LOOP
  // =====================================================================================
  async function frameLoop() {
    if (!isActive) return;
    if (videoEl.readyState >= 2) {
      await handsInstance.send({ image: videoEl });
    }
    animFrameId = requestAnimationFrame(frameLoop);
  }

  // =====================================================================================
  // ON RESULTS CALLBACK
  // =====================================================================================
  function onHandsResults(results) {
    if (!isActive) return;

    if (loadingEl.style.display !== "none") {
      loadingEl.style.display = "none";
    }

    var cw = canvasEl.width;
    var ch = canvasEl.height;

    // Draw mirrored video
    ctx.save();
    ctx.clearRect(0, 0, cw, ch);
    ctx.translate(cw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(results.image, 0, 0, cw, ch);
    ctx.restore();

    var detectedDir = null;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      var landmarks = results.multiHandLandmarks[0];

      // Mirror landmarks for display (natural mirror effect)
      var mirrored = landmarks.map(function (l) {
        return { x: 1 - l.x, y: l.y, z: l.z };
      });

      // Draw hand skeleton
      drawConnectors(ctx, mirrored, HAND_CONNECTIONS, {
        color: COLOR_BLUE,
        lineWidth: 2,
      });
      drawLandmarks(ctx, mirrored, {
        color: COLOR_ORANGE,
        lineWidth: 1,
        radius: 3,
      });

      // Highlight index fingertip with distinct color
      var tip8 = mirrored[8];
      drawFingertip(tip8.x * cw, tip8.y * ch, COLOR_GREEN);

      // Detect pointing direction
      detectedDir = detectPointingDirection(mirrored);
    }

    // Debounce direction changes to avoid flickering
    if (detectedDir === pendingDirection) {
      directionDebounce++;
    } else {
      pendingDirection = detectedDir;
      directionDebounce = 1;
    }

    if (directionDebounce >= DEBOUNCE_FRAMES && currentDirection !== pendingDirection) {
      currentDirection = pendingDirection;
    }

    // Draw direction overlay on top of everything
    drawDirectionOverlay(currentDirection);
  }

  // =====================================================================================
  // GAME LOOP (50ms) — Sends cart commands based on detected direction
  // =====================================================================================
  function gameLoop() {
    if (!isActive) return;

    try {
      if (connection.readyState !== WebSocket.OPEN) return;

      if (currentDirection) {
        var cfg = DIRECTION_CONFIG[currentDirection];
        send(0, 0, MAX_SPEED, cfg.angle);
        hasSentStop = false;
      } else if (!hasSentStop) {
        send(0, 0, 0, 0);
        hasSentStop = true;
      }
    } catch (e) {
      console.error("Camera send error:", e);
    }
  }

  // =====================================================================================
  // OPEN / CLOSE
  // =====================================================================================
  async function open() {
    cacheDOM();
    modalEl.classList.remove("hidden");
    isActive = true;

    currentDirection = null;
    pendingDirection = null;
    directionDebounce = 0;
    hasSentStop = true;

    loadingEl.style.display = "flex";

    try {
      await initHands();
      await startCameraStream();
      frameLoop();
      gameLoopId = setInterval(gameLoop, GAME_LOOP_MS);
    } catch (err) {
      console.error("Camera init failed:", err);
      loadingEl.style.display = "none";
    }
  }

  function close() {
    isActive = false;

    // Send stop command when closing
    try {
      if (connection.readyState === WebSocket.OPEN) {
        send(0, 0, 0, 0);
      }
    } catch (e) { /* ignore */ }

    if (gameLoopId) {
      clearInterval(gameLoopId);
      gameLoopId = null;
    }

    stopCameraStream();

    if (modalEl) modalEl.classList.add("hidden");
    if (ctx && canvasEl) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    currentDirection = null;
    hasSentStop = true;
  }

  return { open: open, close: close };
})();
