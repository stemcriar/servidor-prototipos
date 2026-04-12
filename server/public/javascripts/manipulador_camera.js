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
  var STEP = 2;
  var GARRA_THRESH = 0.07;
  var GARRA_DEBOUNCE_FRAMES = 6;
  var GAME_LOOP_MS = 50;

  // Colors from project palette
  var COLOR_BLUE = "#014D8F";
  var COLOR_ORANGE = "#FFA200";
  var COLOR_PURPLE = "#7E08AF";
  var COLOR_BTN_IDLE = "rgba(200, 200, 210, 0.30)";
  var COLOR_BTN_PRESSED = "rgba(1, 77, 143, 0.55)";
  var COLOR_BTN_BORDER = "rgba(1, 77, 143, 0.25)";

  // =====================================================================================
  // D-PAD GEOMETRY
  // =====================================================================================
  // Each D-Pad is a cross of 4 rectangular buttons.
  // Positions are stored as fractions of canvas width/height and calculated at render time.
  // Layout:      [UP]
  //         [LEFT]    [RIGHT]
  //              [DOWN]

  var DPAD_SIZE = 0.09;     // each button = 9% of canvas width
  var DPAD_GAP = 0.005;     // gap between center and button edge

  var DPAD_L_CX = 0.18;    // D-Pad Left center X (fraction)
  var DPAD_L_CY = 0.55;    // D-Pad Left center Y (fraction)
  var DPAD_R_CX = 0.82;    // D-Pad Right center X (fraction)
  var DPAD_R_CY = 0.55;    // D-Pad Right center Y (fraction)

  // Active button state for each D-Pad (null or 'up'/'down'/'left'/'right')
  var dpadLActive = null;
  var dpadRActive = null;

  // Garra state
  var lastGarra = null;
  var pendingGarra = null;
  var garraDebounce = 0;

  // Track what changed to only send deltas
  var pendingSends = {};

  // =====================================================================================
  // D-PAD BUTTON RECTS (computed in pixels, refreshed each frame)
  // =====================================================================================
  function getDpadButtons(cx, cy, cw, ch) {
    var bw = cw * DPAD_SIZE;
    var bh = ch * DPAD_SIZE;
    var gap = cw * DPAD_GAP;
    var centerX = cx * cw;
    var centerY = cy * ch;

    return {
      up: {
        x: centerX - bw / 2,
        y: centerY - bh - gap - bh / 2,
        w: bw,
        h: bh
      },
      down: {
        x: centerX - bw / 2,
        y: centerY + gap + bh / 2,
        w: bw,
        h: bh
      },
      left: {
        x: centerX - bw - gap - bw / 2,
        y: centerY - bh / 2,
        w: bw,
        h: bh
      },
      right: {
        x: centerX + gap + bw / 2,
        y: centerY - bh / 2,
        w: bw,
        h: bh
      }
    };
  }

  // =====================================================================================
  // AABB COLLISION
  // =====================================================================================
  function isInsideRect(px, py, rect) {
    return px >= rect.x && px <= rect.x + rect.w &&
           py >= rect.y && py <= rect.y + rect.h;
  }

  // =====================================================================================
  // DRAW D-PAD
  // =====================================================================================
  function drawDpad(cx, cy, activeBtn, label) {
    var cw = canvasEl.width;
    var ch = canvasEl.height;
    var btns = getDpadButtons(cx, cy, cw, ch);
    var dirs = ['up', 'down', 'left', 'right'];
    var arrows = { up: '▲', down: '▼', left: '◀', right: '▶' };

    dirs.forEach(function (dir) {
      var r = btns[dir];
      var pressed = (activeBtn === dir);

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 6);
      ctx.fillStyle = pressed ? COLOR_BTN_PRESSED : COLOR_BTN_IDLE;
      ctx.fill();
      ctx.strokeStyle = pressed ? COLOR_BLUE : COLOR_BTN_BORDER;
      ctx.lineWidth = pressed ? 2.5 : 1.5;
      ctx.stroke();

      // Arrow icon
      ctx.fillStyle = pressed ? "#ffffff" : "rgba(1, 77, 143, 0.6)";
      ctx.font = "bold " + Math.round(r.h * 0.45) + "px Rubik, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(arrows[dir], r.x + r.w / 2, r.y + r.h / 2);
      ctx.restore();
    });

    // Label below D-Pad
    ctx.save();
    var fontSize = Math.round(cw * 0.022);
    ctx.font = fontSize + "px Rubik, sans-serif";
    
    var labelY = cy * ch + ch * DPAD_SIZE + ch * DPAD_SIZE * 0.5 + ch * 0.02;
    var textWidth = ctx.measureText(label).width;

    // Draw background for contrast
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath();
    ctx.roundRect(cx * cw - textWidth / 2 - 10, labelY - 5, textWidth + 20, fontSize + 10, 5);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(label, cx * cw, labelY);
    ctx.restore();
  }

  // =====================================================================================
  // DRAW FINGERTIP INDICATOR
  // =====================================================================================
  function drawFingertip(px, py, handColor) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, 10, 0, Math.PI * 2);
    ctx.fillStyle = handColor;
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
    videoEl = document.getElementById("camera-video");
    canvasEl = document.getElementById("camera-canvas");
    ctx = canvasEl.getContext("2d");
    modalEl = document.getElementById("camera-modal");
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
      maxNumHands: 2,
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
        canvasEl.width = videoEl.videoWidth;
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

    // Reset active states for this frame
    dpadLActive = null;
    dpadRActive = null;

        // Process each detected hand
    if (results.multiHandLandmarks) {
      for (var i = 0; i < results.multiHandLandmarks.length; i++) {
        var landmarks = results.multiHandLandmarks[i];

        // Draw hand skeleton (mirrored coordinates)
        var mirrored = landmarks.map(function (l) {
          return { x: 1 - l.x, y: l.y, z: l.z };
        });

        // Use wrist (landmark 0) to determine which side of the screen the hand is physically drawn on
        var isRightSideDisplay = mirrored[0].x > 0.5;
        var handColor = isRightSideDisplay ? COLOR_PURPLE : COLOR_ORANGE;

        drawConnectors(ctx, mirrored, HAND_CONNECTIONS, {
          color: COLOR_BLUE,
          lineWidth: 2,
        });
        drawLandmarks(ctx, mirrored, {
          color: handColor,
          lineWidth: 1,
          radius: 3,
        });

        // Index fingertip (landmark 8)
        var tip8 = mirrored[8];
        var tipPx = tip8.x * cw;
        var tipPy = tip8.y * ch;

        drawFingertip(tipPx, tipPy, handColor);

        // Visual right side controls Antebraço/Punho (Right D-Pad) and Mão Direita (Garra)
        if (isRightSideDisplay) {
          dpadRActive = checkDpadCollision(DPAD_R_CX, DPAD_R_CY, tipPx, tipPy);
          checkGarra(mirrored);
        } else {
          dpadLActive = checkDpadCollision(DPAD_L_CX, DPAD_L_CY, tipPx, tipPy);
        }
      }
    }

    // Draw D-Pads with active state
    drawDpad(DPAD_L_CX, DPAD_L_CY, dpadLActive, "Base / Braço");
    drawDpad(DPAD_R_CX, DPAD_R_CY, dpadRActive, "Antebraço / Punho");
  }

  // =====================================================================================
  // COLLISION CHECK
  // =====================================================================================
  function checkDpadCollision(cx, cy, px, py) {
    var cw = canvasEl.width;
    var ch = canvasEl.height;
    var btns = getDpadButtons(cx, cy, cw, ch);
    var dirs = ['up', 'down', 'left', 'right'];

    for (var i = 0; i < dirs.length; i++) {
      if (isInsideRect(px, py, btns[dirs[i]])) {
        return dirs[i];
      }
    }
    return null;
  }

  // =====================================================================================
  // GARRA (PINCH DETECTION ON RIGHT HAND)
  // =====================================================================================
  function checkGarra(mirroredLandmarks) {
    var thumb = mirroredLandmarks[4];
    var index = mirroredLandmarks[8];
    var dist = Math.sqrt(Math.pow(thumb.x - index.x, 2) + Math.pow(thumb.y - index.y, 2));
    var det = dist < GARRA_THRESH ? "closed" : "open";

    if (det === pendingGarra) {
      garraDebounce++;
    } else {
      pendingGarra = det;
      garraDebounce = 1;
    }

    if (garraDebounce >= GARRA_DEBOUNCE_FRAMES && lastGarra !== pendingGarra) {
      lastGarra = pendingGarra;
      var newGarraAngle = lastGarra === "closed" ? 90 : 0;
      servoAngles.garra = newGarraAngle;
      pendingSends["garra"] = newGarraAngle;

      var btn = document.querySelector(".switch-claw");
      if (lastGarra === "closed") {
        btn.classList.add("enabled");
        btn.classList.remove("disabled");
      } else {
        btn.classList.add("disabled");
        btn.classList.remove("enabled");
      }
    }
  }

  // =====================================================================================
  // GAME LOOP (50ms) — Incremental angle changes based on active D-Pad buttons
  // =====================================================================================
  function gameLoop() {
    if (!isActive) return;

    var changed = false;

    // D-Pad LEFT controls: Base (left/right) and Braço (up/down)
    if (dpadLActive === "right") {
      servoAngles.base = clamp(servoAngles.base + STEP, 0, 180);
      pendingSends["base"] = servoAngles.base;
      changed = true;
    } else if (dpadLActive === "left") {
      servoAngles.base = clamp(servoAngles.base - STEP, 0, 180);
      pendingSends["base"] = servoAngles.base;
      changed = true;
    }

    if (dpadLActive === "up") {
      servoAngles.braco = clamp(servoAngles.braco - STEP, 0, 180);
      pendingSends["braco"] = servoAngles.braco;
      changed = true;
    } else if (dpadLActive === "down") {
      servoAngles.braco = clamp(servoAngles.braco + STEP, 0, 180);
      pendingSends["braco"] = servoAngles.braco;
      changed = true;
    }

    // D-Pad RIGHT controls: Antebraço (up/down) and Punho (left/right)
    if (dpadRActive === "up") {
      servoAngles.antebraco = clamp(servoAngles.antebraco - STEP, 0, 180);
      pendingSends["antebraco"] = servoAngles.antebraco;
      changed = true;
    } else if (dpadRActive === "down") {
      servoAngles.antebraco = clamp(servoAngles.antebraco + STEP, 0, 180);
      pendingSends["antebraco"] = servoAngles.antebraco;
      changed = true;
    }

    if (dpadRActive === "right") {
      servoAngles.punho = clamp(servoAngles.punho + STEP, 0, 180);
      pendingSends["punho"] = servoAngles.punho;
      changed = true;
    } else if (dpadRActive === "left") {
      servoAngles.punho = clamp(servoAngles.punho - STEP, 0, 180);
      pendingSends["punho"] = servoAngles.punho;
      changed = true;
    }

    // Send only what changed
    if (Object.keys(pendingSends).length > 0) {
      try {
        if (connection.readyState === WebSocket.OPEN) {
          Object.keys(pendingSends).forEach(function (key) {
            sendServo(key, pendingSends[key]);
          });
        }
      } catch (e) {
        console.error("Camera send error:", e);
      }
      pendingSends = {};
    }
  }

  // =====================================================================================
  // UTILS
  // =====================================================================================
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // =====================================================================================
  // OPEN / CLOSE
  // =====================================================================================
  async function open() {
    cacheDOM();
    modalEl.classList.remove("hidden");
    isActive = true;

    lastGarra = servoAngles.garra > 45 ? "closed" : "open";
    pendingGarra = lastGarra;
    garraDebounce = 0;
    dpadLActive = null;
    dpadRActive = null;
    pendingSends = {};

    resetServos();

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

    if (gameLoopId) {
      clearInterval(gameLoopId);
      gameLoopId = null;
    }

    stopCameraStream();

    if (modalEl) modalEl.classList.add("hidden");
    if (ctx && canvasEl) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  }

  return { open: open, close: close };
})();
