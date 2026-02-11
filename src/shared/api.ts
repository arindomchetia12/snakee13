export type InitResponse = {
  type: 'init';
  postId: string;
  count: number;
  username: string;
};

export type IncrementResponse = {
  type: 'increment';
  postId: string;
  count: number;
};

export type DecrementResponse = {
  type: 'decrement';
  postId: string;
  count: number;
};

export type SnakeComment = {
  id: string;
  username: string;
  score: number;
  message: string;
  createdAt: string;
};

export type SnakeInitResponse = {
  type: 'snake-init';
  postId: string;
  username: string;
  highScore: number;
  comments: SnakeComment[];
};

export type SnakeScoreResponse = {
  type: 'snake-score';
  postId: string;
  highScore: number;
  newBest: boolean;
  comment?: SnakeComment;
};

export type SnakeCommentsResponse = {
  type: 'snake-comments';
  postId: string;
  comments: SnakeComment[];
};
