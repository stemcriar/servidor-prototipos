// =====================================================================================
// WEBSOCKET CONNECTION
// =====================================================================================

var connection = new WebSocket("ws://" + location.hostname + ":1801/", [
  "arduino",
]);
connection.onopen = function () {
  connection.send(startPage());
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
  // placeholder for future feedback from manipulator
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
  } else {
    button.classList.add("disabled");
    button.classList.remove("enabled");
  }

  var command = { from: "effector", state: "0" };
  commandJson = JSON.stringify(command);
  connection.send(commandJson);
}

// =====================================================================================
// JOYSTICK IMPLEMENTATION
// =====================================================================================

// Creates a joystick controller on a given canvas element.
// name: "joystickL" or "joystickR" — determines the 'from' field in WebSocket messages
function createJoystick(canvasId, name) {
  var canvas = document.getElementById(canvasId);
  var ctx = canvas.getContext("2d");

  var radius = 60;        // outer circle radius (will be recalculated)
  var innerRadius = 30;   // joystick ball radius (will be recalculated)
  var borderPad = 22;     // space for the border stroke

  var x_orig, y_orig;     // center of the joystick
  var paint = false;
  var activeTouchId = null; // tracks which finger is controlling this joystick

  // Interval that sends direction while joystick is held
  var sendInterval = null;
  var currentDirX = 0;
  var currentDirY = 0;

  function resize() {
    // Collapse canvas so it doesn't influence the flex container sizing
    canvas.width = 0;
    canvas.height = 0;

    var wrapper = canvas.parentElement;
    var labelEl = wrapper.querySelector('.control-description');
    var labelHeight = labelEl ? (labelEl.offsetHeight + 6) : 22;

    var availW = wrapper.clientWidth;
    var availH = wrapper.clientHeight - labelHeight;

    // Use the smaller dimension as the max diameter
    var diameter = Math.min(availW, availH);
    if (diameter < 80) diameter = 80;

    // Calculate radius leaving room for the border stroke
    radius = (diameter / 2) - borderPad;
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

  // Convert relative position to direction: -1, 0, or 1
  function toDirection(value, deadzone) {
    if (value > deadzone) return 1;
    if (value < -deadzone) return -1;
    return 0;
  }

  function sendDirection(dirX, dirY) {
    var command = {
      from: name,
      state: dirX + "," + dirY,
    };
    var commandJson = JSON.stringify(command);
    console.log(commandJson);
    connection.send(commandJson);
  }

  function startContinuousSend() {
    if (sendInterval) return;
    sendInterval = setInterval(function () {
      if (paint && (currentDirX !== 0 || currentDirY !== 0)) {
        sendDirection(currentDirX, currentDirY);
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

    // Deadzone is 30% of radius
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

    // Send a final stop command
    sendDirection(0, 0);
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

  canvas.addEventListener("touchstart", function (e) {
    e.preventDefault();
    // If this joystick is already being controlled by a finger, ignore new touches
    if (activeTouchId !== null) return;

    for (var i = 0; i < e.changedTouches.length; i++) {
      var touch = e.changedTouches[i];
      var coords = getCanvasCoords(touch.clientX, touch.clientY);
      if (handleStart(coords.x, coords.y)) {
        activeTouchId = touch.identifier;
        break;
      }
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", function (e) {
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
  }, { passive: false });

  canvas.addEventListener("touchend", function (e) {
    e.preventDefault();
    if (activeTouchId === null) return;

    for (var i = 0; i < e.changedTouches.length; i++) {
      var touch = e.changedTouches[i];
      if (touch.identifier === activeTouchId) {
        handleEnd();
        break;
      }
    }
  }, { passive: false });

  canvas.addEventListener("touchcancel", function (e) {
    e.preventDefault();
    if (activeTouchId === null) return;

    for (var i = 0; i < e.changedTouches.length; i++) {
      var touch = e.changedTouches[i];
      if (touch.identifier === activeTouchId) {
        handleEnd();
        break;
      }
    }
  }, { passive: false });

  // ===================== INIT =====================

  window.addEventListener("resize", resize);
  resize();

  return { resize: resize };
}

// =====================================================================================
// INITIALIZE JOYSTICKS ON PAGE LOAD
// =====================================================================================

window.addEventListener("load", function () {
  createJoystick("canvasLeft", "joystickL");
  createJoystick("canvasRight", "joystickR");
});
