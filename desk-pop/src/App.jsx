import { useEffect, useRef, useState } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import "./App.css";

const GAME_DURATION = 60;

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const handLandmarkerRef = useRef(null);
  const animationRef = useRef(null);
  const audioContextRef = useRef(null);

  const gameRunningRef = useRef(false);

  const circleRef = useRef({
    x: 300,
    y: 200,
    radius: 55,
  });

  const popEffectsRef = useRef([]);

  const [status, setStatus] = useState("Loading...");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [gameRunning, setGameRunning] = useState(false);

  useEffect(() => {
    gameRunningRef.current = gameRunning;
  }, [gameRunning]);

  useEffect(() => {
    let isMounted = true;

    async function setup() {
      try {
        setStatus("Starting camera...");

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 720,
            height: 540,
          },
          audio: false,
        });

        if (!videoRef.current) return;

        videoRef.current.srcObject = stream;

        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = resolve;
        });

        setStatus("Loading hand model...");

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });

        handLandmarkerRef.current = handLandmarker;

        if (isMounted) {
          setStatus("Ready. Press Start.");
          detectLoop();
        }
      } catch (error) {
        console.error(error);
        setStatus("Something went wrong. Check the console.");
      }
    }

    function detectLoop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const handLandmarker = handLandmarkerRef.current;

      if (!video || !canvas || !handLandmarker) {
        animationRef.current = requestAnimationFrame(detectLoop);
        return;
      }

      const ctx = canvas.getContext("2d");

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const result = handLandmarker.detectForVideo(video, performance.now());

      drawPopEffects(ctx);

      if (gameRunningRef.current) {
        drawCircle(ctx);
      }

      if (result.landmarks && result.landmarks.length > 0) {
        for (const hand of result.landmarks) {
          const palm = getPalmCenter(hand);

          drawPalm(ctx, palm, canvas);

          if (gameRunningRef.current) {
            checkHit(palm, canvas);
          }
        }
      }

      animationRef.current = requestAnimationFrame(detectLoop);
    }

    function getPalmCenter(handLandmarks) {
      const palmPoints = [
        handLandmarks[0],
        handLandmarks[5],
        handLandmarks[9],
        handLandmarks[13],
        handLandmarks[17],
      ];

      const palm = palmPoints.reduce(
        (acc, point) => {
          acc.x += point.x;
          acc.y += point.y;
          acc.z += point.z || 0;
          return acc;
        },
        { x: 0, y: 0, z: 0 }
      );

      return {
        x: palm.x / palmPoints.length,
        y: palm.y / palmPoints.length,
        z: palm.z / palmPoints.length,
      };
    }

    function drawCircle(ctx) {
      const circle = circleRef.current;

      ctx.beginPath();
      ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 200, 255, 0.8)";
      ctx.fill();

      ctx.lineWidth = 4;
      ctx.strokeStyle = "white";
      ctx.stroke();
    }

    function drawPalm(ctx, palm, canvas) {
      if (!palm) return;

      const x = palm.x * canvas.width;
      const y = palm.y * canvas.height;

      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.fill();

      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0, 200, 255, 1)";
      ctx.stroke();

      ctx.font = "18px Arial";
      ctx.fillStyle = "white";
      ctx.fillText("Palm", x + 18, y);
    }

    function drawPopEffects(ctx) {
      popEffectsRef.current = popEffectsRef.current
        .map((effect) => ({
          ...effect,
          radius: effect.radius + 4,
          opacity: effect.opacity - 0.05,
        }))
        .filter((effect) => effect.opacity > 0);

      for (const effect of popEffectsRef.current) {
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${effect.opacity})`;
        ctx.lineWidth = 5;
        ctx.stroke();
      }
    }

    function playPopSound() {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      const audioContext = audioContextRef.current;

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        1200,
        audioContext.currentTime + 0.08
      );

      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + 0.12
      );

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.12);
    }

    function checkHit(palm, canvas) {
      if (!palm) return;

      const circle = circleRef.current;

      const palmX = palm.x * canvas.width;
      const palmY = palm.y * canvas.height;

      const distance = Math.hypot(palmX - circle.x, palmY - circle.y);

      if (distance < circle.radius) {
        popEffectsRef.current.push({
          x: circle.x,
          y: circle.y,
          radius: circle.radius,
          opacity: 1,
        });

        playPopSound();

        setScore((previousScore) => previousScore + 1);
        spawnNewCircle(canvas);
      }
    }

    function spawnNewCircle(canvas) {
      const margin = 90;

      circleRef.current = {
        x: margin + Math.random() * (canvas.width - margin * 2),
        y: margin + Math.random() * (canvas.height - margin * 2),
        radius: 55,
      };
    }

    setup();

    return () => {
      isMounted = false;

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      if (videoRef.current?.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!gameRunning) return;

    if (timeLeft <= 0) {
      setGameRunning(false);
      setStatus(`Finished! Final score: ${score}`);
      return;
    }

    const timerId = setTimeout(() => {
      setTimeLeft((currentTime) => currentTime - 1);
    }, 1000);

    return () => clearTimeout(timerId);
  }, [gameRunning, timeLeft, score]);

  function startGame() {
    const canvas = canvasRef.current;

    setScore(0);
    setTimeLeft(GAME_DURATION);
    setGameRunning(true);
    setStatus("Pop the circles with your palm!");

    if (canvas) {
      spawnCircle(canvas);
    }
  }

  function spawnCircle(canvas) {
    const margin = 90;

    circleRef.current = {
      x: margin + Math.random() * (canvas.width - margin * 2),
      y: margin + Math.random() * (canvas.height - margin * 2),
      radius: 55,
    };
  }

  return (
    <div className="app">
      <h1>Desk Pop</h1>

      <div className="hud">
        <p>{status}</p>
        <p>Score: {score}</p>
        <p>Time: {timeLeft}</p>
      </div>

      <button onClick={startGame} className="start-button">
        {gameRunning ? "Restart" : "Start"}
      </button>

      <div className="stage">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="camera"
        />
        <canvas ref={canvasRef} className="overlay" />
      </div>
    </div>
  );
}

export default App;