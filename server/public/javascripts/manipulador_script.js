// =====================================================================================
// SERVO STATE (shared between joystick and camera modules)
// =====================================================================================

var servoAngles = {
  base: 90,
  braco: 60,
  antebraco: 50,
  punho: 140,
  garra: 0,
};

var SERVO_DEFAULTS = {
  base: 90,
  braco: 60,
  antebraco: 50,
  punho: 140,
  garra: 0,
};

var SERVO_STEP = 3;

function sendServo(name, angle) {
  angle = Math.max(0, Math.min(180, Math.round(angle)));
  servoAngles[name] = angle;
  if (connection.readyState === WebSocket.OPEN) {
    connection.send(JSON.stringify({ from: name, angle: angle }));
  }
}

function resetServos() {
  Object.keys(SERVO_DEFAULTS).forEach(function (key) {
    servoAngles[key] = SERVO_DEFAULTS[key];
    sendServo(key, SERVO_DEFAULTS[key]);
  });
}

// =====================================================================================
// WEBSOCKET CONNECTION (auto-detect ws/wss)
// =====================================================================================

var wsProtocol = location.protocol === "https:" ? "wss" : "ws";
var wsPort = location.protocol === "https:" ? "1802" : "1801";
var connection = new WebSocket(
  wsProtocol + "://" + location.hostname + ":" + wsPort + "/",
  ["arduino"]
);

connection.onopen = function () {
  connection.send(startPage());
  resetServos();
};
connection.onerror = function (error) {
  console.log("WebSocket Error ", error);
};
connection.onmessage = function (e) {
  console.log("Server: ", e.data);
  receiveData(e.data);
};
connection.onclose = function () {
  console.log("WebSocket connection closed");
};

function receiveData(data) {
  console.log("Mensagem recebida: ", data);
}

function startPage() {
  let id = getCookie("esp_id");
  let robot = getCookie("robot");
  startInfo = {
    start: "page_on",
    to: id,
    meta: robot,
  };
  startInfoJson = JSON.stringify(startInfo);
  return startInfoJson;
}

function getCookie(cname) {
  var name = cname + "=";
  var decodedCookie = decodeURIComponent(document.cookie);
  var ca = decodedCookie.split(";");
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == " ") {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

// =====================================================================================
// EFFECTOR BUTTON
// =====================================================================================

function switchEffector() {
  const button = document.querySelector(".switch-claw");

  if (button.classList.contains("disabled")) {
    button.classList.add("enabled");
    button.classList.remove("disabled");
    servoAngles.garra = 90;
  } else {
    button.classList.add("disabled");
    button.classList.remove("enabled");
    servoAngles.garra = 0;
  }

  sendServo("garra", servoAngles.garra);
}

// =====================================================================================
// JOYSTICK IMPLEMENTATION (angle-based)
// =====================================================================================

// servoXName/servoYName: which servos this joystick controls
// invertX/invertY: flip direction if needed for intuitive control
function createJoystick(canvasId, servoXName, servoYName, invertX, invertY) {
  var canvas = document.getElementById(canvasId);
  var ctx = canvas.getContext("2d");

  var radius = 60;
  var innerRadius = 30;
  var borderPad = 22;

  var x_orig, y_orig;
  var paint = false;
  var activeTouchId = null;

  var sendInterval = null;
  var currentDirX = 0;
  var currentDirY = 0;

  function resize() {
    canvas.width = 0;
    canvas.height = 0;

    var wrapper = canvas.parentElement;
    var labelEl = wrapper.querySelector(".control-description");
    var labelHeight = labelEl ? labelEl.offsetHeight + 6 : 22;

    var availW = wrapper.clientWidth;
    var availH = wrapper.clientHeight - labelHeight;

    var diameter = Math.min(availW, availH);
    if (diameter < 80) diameter = 80;

    radius = diameter / 2 - borderPad;
    if (radius < 25) radius = 25;
    innerRadius = radius / 2;

    var canvasSize = Math.floor((radius + borderPad) * 2);
    canvas.width = canvasSize;
    canvas.height = canvasSize;

    x_orig = canvasSize / 2;
    y_orig = canvasSize / 2;

    drawBackground();
    drawJoystickBall(x_orig, y_orig);
  }

  function drawBackground() {
    ctx.beginPath();
    ctx.arc(x_orig, y_orig, radius + (borderPad - 2), 0, Math.PI * 2, true);
    ctx.fillStyle = "rgba(0, 0, 0, 0)";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#014D8F";
    ctx.shadowBlur = 0;
    ctx.fill();
    ctx.stroke();
  }

  function drawJoystickBall(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, innerRadius, 0, Math.PI * 2, true);
    ctx.fillStyle = "#FFA200";
    ctx.shadowColor = "#0000006B";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function redraw(ballX, ballY) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawJoystickBall(ballX, ballY);
  }

  function toDirection(value, deadzone) {
    if (value > deadzone) return 1;
    if (value < -deadzone) return -1;
    return 0;
  }

  function applyStep() {
    var changed = false;

    if (currentDirX !== 0) {
      var stepX = (invertX ? -1 : 1) * currentDirX * SERVO_STEP;
      var newAngleX = Math.max(0, Math.min(180, servoAngles[servoXName] + stepX));
      if (newAngleX !== servoAngles[servoXName]) {
        sendServo(servoXName, newAngleX);
        changed = true;
      }
    }

    if (currentDirY !== 0) {
      var stepY = (invertY ? -1 : 1) * currentDirY * SERVO_STEP;
      var newAngleY = Math.max(0, Math.min(180, servoAngles[servoYName] + stepY));
      if (newAngleY !== servoAngles[servoYName]) {
        sendServo(servoYName, newAngleY);
        changed = true;
      }
    }
  }

  function startContinuousSend() {
    if (sendInterval) return;
    sendInterval = setInterval(function () {
      if (paint && (currentDirX !== 0 || currentDirY !== 0)) {
        applyStep();
      }
    }, 50);
  }

  function stopContinuousSend() {
    if (sendInterval) {
      clearInterval(sendInterval);
      sendInterval = null;
    }
  }

  function getCanvasCoords(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function isInCircle(x, y) {
    var dist = Math.sqrt(Math.pow(x - x_orig, 2) + Math.pow(y - y_orig, 2));
    return dist <= radius;
  }

  function clampToCircle(x, y) {
    var angle = Math.atan2(y - y_orig, x - x_orig);
    return {
      x: radius * Math.cos(angle) + x_orig,
      y: radius * Math.sin(angle) + y_orig,
    };
  }

  function handleStart(x, y) {
    if (!isInCircle(x, y)) return false;
    paint = true;
    handleMove(x, y);
    startContinuousSend();
    return true;
  }

  function handleMove(x, y) {
    if (!paint) return;

    var ballX, ballY;
    if (isInCircle(x, y)) {
      ballX = x;
      ballY = y;
    } else {
      var clamped = clampToCircle(x, y);
      ballX = clamped.x;
      ballY = clamped.y;
    }

    redraw(ballX, ballY);

    var x_relative = ballX - x_orig;
    var y_relative = ballY - y_orig;

    var deadzone = radius * 0.3;
    currentDirX = toDirection(x_relative, deadzone);
    currentDirY = toDirection(y_relative, deadzone);
  }

  function handleEnd() {
    paint = false;
    activeTouchId = null;
    currentDirX = 0;
    currentDirY = 0;
    stopContinuousSend();
    redraw(x_orig, y_orig);
  }

  // ===================== MOUSE EVENTS =====================

  canvas.addEventListener("mousedown", function (e) {
    var coords = getCanvasCoords(e.clientX, e.clientY);
    handleStart(coords.x, coords.y);
  });

  canvas.addEventListener("mousemove", function (e) {
    if (!paint) return;
    var coords = getCanvasCoords(e.clientX, e.clientY);
    handleMove(coords.x, coords.y);
  });

  canvas.addEventListener("mouseup", function (e) {
    if (paint) handleEnd();
  });

  canvas.addEventListener("mouseleave", function (e) {
    if (paint) handleEnd();
  });

  // ===================== TOUCH EVENTS (multi-touch safe) =====================

  canvas.addEventListener(
    "touchstart",
    function (e) {
      e.preventDefault();
      if (activeTouchId !== null) return;

      for (var i = 0; i < e.changedTouches.length; i++) {
        var touch = e.changedTouches[i];
        var coords = getCanvasCoords(touch.clientX, touch.clientY);
        if (handleStart(coords.x, coords.y)) {
          activeTouchId = touch.identifier;
          break;
        }
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    function (e) {
      e.preventDefault();
      if (activeTouchId === null) return;

      for (var i = 0; i < e.changedTouches.length; i++) {
        var touch = e.changedTouches[i];
        if (touch.identifier === activeTouchId) {
          var coords = getCanvasCoords(touch.clientX, touch.clientY);
          handleMove(coords.x, coords.y);
          break;
        }
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchend",
    function (e) {
      e.preventDefault();
      if (activeTouchId === null) return;

      for (var i = 0; i < e.changedTouches.length; i++) {
        var touch = e.changedTouches[i];
        if (touch.identifier === activeTouchId) {
          handleEnd();
          break;
        }
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchcancel",
    function (e) {
      e.preventDefault();
      if (activeTouchId === null) return;

      for (var i = 0; i < e.changedTouches.length; i++) {
        var touch = e.changedTouches[i];
        if (touch.identifier === activeTouchId) {
          handleEnd();
          break;
        }
      }
    },
    { passive: false }
  );

  // ===================== INIT =====================

  window.addEventListener("resize", resize);
  resize();

  return { resize: resize };
}

// =====================================================================================
// INITIALIZE JOYSTICKS ON PAGE LOAD
// =====================================================================================

window.addEventListener("load", function () {
  // Left joystick: X axis = base (servo0), Y axis = braco (servo1)
  createJoystick("canvasLeft", "base", "braco", true, false);
  // Right joystick: X axis = punho (servo3), Y axis = antebraco (servo2)
  createJoystick("canvasRight", "punho", "antebraco", true, true);
});
