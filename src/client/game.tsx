import './index.css';

import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  SnakeComment,
  SnakeInitResponse,
  SnakeScoreResponse,
} from '../shared/api';

type Cell = {
  x: number;
  y: number;
};

type Direction = {
  x: number;
  y: number;
};

const BOARD_SIZE = 20;
const BASE_TICK_MS = 800; // starting speed (~0.8s per step)
const MIN_TICK_MS = 150; // fastest speed cap

const randomInt = (max: number) => Math.floor(Math.random() * max);

const randomColor = () => {
  const hue = randomInt(360);
  return `hsl(${hue} 80% 50%)`;
};

const cellsEqual = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

const generateFood = (snake: Cell[]): Cell => {
  for (let i = 0; i < 100; i++) {
    const candidate = { x: randomInt(BOARD_SIZE), y: randomInt(BOARD_SIZE) };
    if (!snake.some((s) => cellsEqual(s, candidate))) {
      return candidate;
    }
  }
  return { x: 0, y: 0 };
};

const useSnakeGame = () => {
  const [username, setUsername] = useState<string | null>(null);
  const [loadingInit, setLoadingInit] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<SnakeComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [highScore, setHighScore] = useState(0);

  const [snake, setSnake] = useState<Cell[]>([
    { x: Math.floor(BOARD_SIZE / 2), y: Math.floor(BOARD_SIZE / 2) },
  ]);
  const [direction, setDirection] = useState<Direction>({ x: 1, y: 0 });
  const [nextDirection, setNextDirection] = useState<Direction>({ x: 1, y: 0 });
  const [food, setFood] = useState<Cell>(() => generateFood([]));
  const [snakeColor, setSnakeColor] = useState<string>(() => randomColor());
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [tickMs, setTickMs] = useState(BASE_TICK_MS);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('/api/snake/init');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: SnakeInitResponse = await res.json();
        if (data.type !== 'snake-init') throw new Error('Unexpected response');
        setUsername(data.username);
        setHighScore(data.highScore);
        setComments(data.comments ?? []);
      } catch (err) {
        console.error('Failed to init snake', err);
        setError('Could not load scoreboard – you can still play!');
      } finally {
        setLoadingInit(false);
      }
    };
    void init();
  }, []);

  const resetGame = useCallback(() => {
    const center = Math.floor(BOARD_SIZE / 2);
    const startCell: Cell = { x: center, y: center };
    setSnake([startCell]);
    setDirection({ x: 1, y: 0 });
    setNextDirection({ x: 1, y: 0 });
    setFood(generateFood([startCell]));
    setSnakeColor(randomColor());
    setScore(0);
    setGameOver(false);
    setIsRunning(true);
    setTickMs(BASE_TICK_MS);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        event.preventDefault();
        if (gameOver) {
          resetGame();
        } else {
          setIsRunning((prev) => !prev);
        }
        return;
      }

      let next: Direction | null = null;
      if (event.key === 'ArrowUp' || event.key === 'w') next = { x: 0, y: -1 };
      if (event.key === 'ArrowDown' || event.key === 's') next = { x: 0, y: 1 };
      if (event.key === 'ArrowLeft' || event.key === 'a') next = { x: -1, y: 0 };
      if (event.key === 'ArrowRight' || event.key === 'd') next = { x: 1, y: 0 };

      if (!next) return;

      if (next.x === -direction.x && next.y === -direction.y) {
        return;
      }

      setNextDirection(next);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [direction, gameOver, resetGame]);

  useEffect(() => {
    if (!isRunning || gameOver) return;

    const id = window.setInterval(() => {
      setDirection(nextDirection);
      setSnake((current) => {
        if (current.length === 0) return current;
        const head = current[0];
        if (!head) return current;

        const newHead: Cell = {
          x: head.x + nextDirection.x,
          y: head.y + nextDirection.y,
        };

        if (
          newHead.x < 0 ||
          newHead.y < 0 ||
          newHead.x >= BOARD_SIZE ||
          newHead.y >= BOARD_SIZE
        ) {
          setGameOver(true);
          setIsRunning(false);
          return current;
        }

        if (current.some((segment) => cellsEqual(segment, newHead))) {
          setGameOver(true);
          setIsRunning(false);
          return current;
        }

        if (cellsEqual(newHead, food)) {
          const grown = [newHead, ...current];
          setScore((prev) => prev + 1);
          setTickMs((prev) => {
            const next = prev * 0.9; // 10% faster each food
            return next < MIN_TICK_MS ? MIN_TICK_MS : next;
          });
          setSnakeColor(randomColor());
          setFood(generateFood(grown));
          return grown;
        }

        const withoutTail = current.slice(0, -1);
        return [newHead, ...withoutTail];
      });
    }, tickMs);

    return () => window.clearInterval(id);
  }, [food, gameOver, isRunning, nextDirection, tickMs]);

  const handleShareScore = useCallback(async () => {
    if (score <= 0) return;
    try {
      const res = await fetch('/api/snake/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, message: commentText }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SnakeScoreResponse = await res.json();
      if (data.type !== 'snake-score') return;
      setHighScore(data.highScore);
      if (data.comment) {
        setComments((prev) => [...prev, data.comment!].slice(-20));
      }
      setCommentText('');
    } catch (err) {
      console.error('Failed to share score', err);
      setError('Could not save your score – try again later.');
    }
  }, [commentText, score]);

  const boardCells = useMemo(() => {
    const cells: ('empty' | 'snake' | 'food')[][] = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      const row: ('empty' | 'snake' | 'food')[] = [];
      for (let x = 0; x < BOARD_SIZE; x++) {
        row.push('empty');
      }
      cells.push(row);
    }

    snake.forEach((segment) => {
      if (
        segment.y >= 0 &&
        segment.y < BOARD_SIZE &&
        segment.x >= 0 &&
        segment.x < BOARD_SIZE
      ) {
        const row = cells[segment.y];
        if (row) {
          row[segment.x] = 'snake';
        }
      }
    });

    if (
      food.y >= 0 &&
      food.y < BOARD_SIZE &&
      food.x >= 0 &&
      food.x < BOARD_SIZE
    ) {
      const row = cells[food.y];
      if (row) {
        row[food.x] = 'food';
      }
    }

    return cells;
  }, [snake, food]);

  return {
    username,
    loadingInit,
    error,
    snakeColor,
    score,
    highScore,
    gameOver,
    isRunning,
    comments,
    commentText,
    setCommentText,
    resetGame,
    setIsRunning,
    boardCells,
    handleShareScore,
  } as const;
};

export const App = () => {
  const {
    username,
    loadingInit,
    error,
    snakeColor,
    score,
    highScore,
    gameOver,
    isRunning,
    comments,
    commentText,
    setCommentText,
    resetGame,
    setIsRunning,
    boardCells,
    handleShareScore,
  } = useSnakeGame();

  return (
    <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-stretch justify-center min-h-screen bg-slate-950 text-slate-50 px-4 py-6">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-green-400">
          Snake Arena
        </h1>
        <p className="text-sm text-slate-300">
          {username ? `Welcome, ${username}!` : 'Welcome to the arena!'}
        </p>

        <div className="flex items-center gap-4 bg-slate-900/70 rounded-xl px-4 py-3 shadow-lg shadow-green-500/10">
          <div className="flex flex-col text-sm">
            <span className="text-slate-300">Score</span>
            <span className="text-xl font-bold text-green-400">{score}</span>
          </div>
          <span className="h-8 w-px bg-slate-700" />
          <div className="flex flex-col text-sm">
            <span className="text-slate-300">Best</span>
            <span className="text-xl font-bold text-amber-300">{highScore}</span>
          </div>
          <span className="h-8 w-px bg-slate-700" />
          <div className="flex flex-col text-xs text-slate-400">
            <span>Shift = pause / resume</span>
            <span>Arrows / WASD = move</span>
          </div>
        </div>

        {loadingInit && (
          <p className="text-xs text-slate-400">Loading scoreboard…</p>
        )}
        {error && !loadingInit && (
          <p className="text-xs text-amber-300 max-w-xs text-center">{error}</p>
        )}

        <div className="relative">
          <div
            className="grid bg-slate-900 rounded-xl p-1 shadow-xl shadow-green-500/15 border border-slate-800"
            style={{
              gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
              width: 'min(90vw, 420px)',
              aspectRatio: '1 / 1',
            }}
          >
            {boardCells.map((row, y) =>
              row.map((cell, x) => {
                const key = `${x}-${y}`;
                if (cell === 'snake') {
                  return (
                    <div
                      key={key}
                      className="rounded-sm"
                      style={{ backgroundColor: snakeColor }}
                    />
                  );
                }
                if (cell === 'food') {
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-center"
                    >
                      <div className="w-3 h-3 rounded-full bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.9)]" />
                    </div>
                  );
                }
                return (
                  <div
                    key={key}
                    className="bg-slate-950/40 border border-slate-900/60 rounded-sm"
                  />
                );
              })
            )}
          </div>

          {gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 rounded-xl">
              <p className="text-lg font-bold text-red-300">Game Over</p>
              <p className="text-sm text-slate-200">You scored {score}.</p>
              <button
                className="mt-1 px-4 py-2 rounded-lg bg-green-500 text-slate-950 text-sm font-semibold hover:bg-green-400 transition-colors"
                onClick={resetGame}
              >
                Play again
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-3">
          <button
            className="px-4 py-2 rounded-lg bg-green-500 text-slate-950 text-sm font-semibold hover:bg-green-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (gameOver) resetGame();
              else setIsRunning((prev) => !prev);
            }}
          >
            {gameOver ? 'Restart' : isRunning ? 'Pause' : 'Start'}
          </button>
        </div>
      </div>

      <div className="flex-1 max-w-md mx-auto md:mx-0 flex flex-col gap-4">
        <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-4 flex flex-col gap-3 shadow-lg shadow-slate-900/40">
          <h2 className="text-sm font-semibold text-slate-100">Share your run</h2>
          <p className="text-xs text-slate-400">
            Drop a short message with your score so other players on this post can react and compete.
          </p>
          <textarea
            className="mt-1 w-full min-h-[70px] rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-xs text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500/70 focus:border-transparent resize-none"
            placeholder="Say something about this run (optional)…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            maxLength={280}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.7rem] text-slate-500">
              {commentText.length}/280 characters
            </span>
            <button
              className="px-3 py-1.5 rounded-lg bg-sky-500 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleShareScore}
              disabled={score <= 0}
            >
              Post score ({score})
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-[140px] bg-slate-900/70 rounded-xl border border-slate-800 p-4 flex flex-col gap-3 overflow-hidden">
          <h2 className="text-sm font-semibold text-slate-100">Run chat</h2>
          {comments.length === 0 ? (
            <p className="text-xs text-slate-500">
              No runs shared yet. Be the first one to post a score!
            </p>
          ) : (
            <div className="mt-1 space-y-2 overflow-y-auto pr-1">
              {comments
                .slice()
                .reverse()
                .map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg bg-slate-950/70 border border-slate-800 px-3 py-2 text-xs flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-100 truncate max-w-[60%]">
                        {c.username}
                      </span>
                      <span className="text-[0.7rem] text-emerald-300 font-semibold">
                        {c.score} pts
                      </span>
                    </div>
                    {c.message && (
                      <p className="text-[0.72rem] text-slate-300 whitespace-pre-wrap break-words">
                        {c.message}
                      </p>
                    )}
                    <span className="text-[0.65rem] text-slate-500">
                      {new Date(c.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
