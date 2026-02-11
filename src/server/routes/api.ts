import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  DecrementResponse,
  IncrementResponse,
  InitResponse,
  SnakeInitResponse,
  SnakeScoreResponse,
  SnakeComment,
} from '../../shared/api';

type ErrorResponse = {
  status: 'error';
  message: string;
};

export const api = new Hono();

api.get('/init', async (c) => {
  const { postId } = context;

  if (!postId) {
    console.error('API Init Error: postId not found in devvit context');
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required but missing from context',
      },
      400
    );
  }

  try {
    const [count, username] = await Promise.all([
      redis.get('count'),
      reddit.getCurrentUsername(),
    ]);

    return c.json<InitResponse>({
      type: 'init',
      postId: postId,
      count: count ? parseInt(count) : 0,
      username: username ?? 'anonymous',
    });
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);
    let errorMessage = 'Unknown error during initialization';
    if (error instanceof Error) {
      errorMessage = `Initialization failed: ${error.message}`;
    }
    return c.json<ErrorResponse>(
      { status: 'error', message: errorMessage },
      400
    );
  }
});

api.post('/increment', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required',
      },
      400
    );
  }

  const count = await redis.incrBy('count', 1);
  return c.json<IncrementResponse>({
    count,
    postId,
    type: 'increment',
  });
});

api.post('/decrement', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required',
      },
      400
    );
  }

  const count = await redis.incrBy('count', -1);
  return c.json<DecrementResponse>({
    count,
    postId,
    type: 'decrement',
  });
});

const snakeKeysForPost = (postId: string) => {
  const base = `snake:${postId}`;
  return {
    scoreKey: `${base}:highscore`,
    commentsKey: `${base}:comments`,
  } as const;
};

api.get('/snake/init', async (c) => {
  const { postId } = context;

  if (!postId) {
    console.error('Snake Init Error: postId not found in devvit context');
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required but missing from context',
      },
      400
    );
  }

  try {
    const { scoreKey, commentsKey } = snakeKeysForPost(postId);
    const [rawHighScore, rawComments, username] = await Promise.all([
      redis.get(scoreKey),
      redis.get(commentsKey),
      reddit.getCurrentUsername(),
    ]);

    const highScore = rawHighScore ? parseInt(rawHighScore) : 0;

    let comments: SnakeComment[] = [];
    if (rawComments) {
      try {
        const parsed = JSON.parse(rawComments);
        if (Array.isArray(parsed)) {
          comments = parsed as SnakeComment[];
        }
      } catch (err) {
        console.error('Failed to parse stored snake comments', err);
      }
    }

    return c.json<SnakeInitResponse>({
      type: 'snake-init',
      postId,
      username: username ?? 'anonymous',
      highScore,
      comments,
    });
  } catch (error) {
    console.error(`Snake Init Error for post ${postId}:`, error);
    let errorMessage = 'Unknown error during snake initialization';
    if (error instanceof Error) {
      errorMessage = `Snake initialization failed: ${error.message}`;
    }
    return c.json<ErrorResponse>(
      { status: 'error', message: errorMessage },
      400
    );
  }
});

type SnakeScoreRequest = {
  score: number;
  message?: string;
};

api.post('/snake/score', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required',
      },
      400
    );
  }

  let body: SnakeScoreRequest;
  try {
    body = await c.req.json<SnakeScoreRequest>();
  } catch (err) {
    console.error('Snake score parse error', err);
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'Invalid request body',
      },
      400
    );
  }

  const score = Number(body.score);
  if (!Number.isFinite(score) || score < 0) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'Score must be a non-negative number',
      },
      400
    );
  }

  try {
    const { scoreKey, commentsKey } = snakeKeysForPost(postId);
    const [rawHighScore, rawComments, username] = await Promise.all([
      redis.get(scoreKey),
      redis.get(commentsKey),
      reddit.getCurrentUsername(),
    ]);

    const currentHigh = rawHighScore ? parseInt(rawHighScore) : 0;
    const newBest = score > currentHigh;
    const highScore = newBest ? score : currentHigh;

    if (newBest) {
      await redis.set(scoreKey, String(highScore));
    }

    let comments: SnakeComment[] = [];
    if (rawComments) {
      try {
        const parsed = JSON.parse(rawComments);
        if (Array.isArray(parsed)) {
          comments = parsed as SnakeComment[];
        }
      } catch (err) {
        console.error('Failed to parse stored snake comments', err);
      }
    }

    const trimmedMessage = typeof body.message === 'string' ? body.message.trim() : '';
    let newComment: SnakeComment | undefined;
    if (trimmedMessage) {
      newComment = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        username: username ?? 'anonymous',
        score,
        message: trimmedMessage.slice(0, 280),
        createdAt: new Date().toISOString(),
      };
      comments = [...comments, newComment];
      if (comments.length > 20) {
        comments = comments.slice(comments.length - 20);
      }
      await redis.set(commentsKey, JSON.stringify(comments));
    }

    return c.json<SnakeScoreResponse>({
      type: 'snake-score',
      postId,
      highScore,
      newBest,
      comment: newComment,
    });
  } catch (error) {
    console.error(`Snake Score Error for post ${postId}:`, error);
    let errorMessage = 'Unknown error while saving score';
    if (error instanceof Error) {
      errorMessage = `Saving score failed: ${error.message}`;
    }
    return c.json<ErrorResponse>(
      { status: 'error', message: errorMessage },
      400
    );
  }
});
