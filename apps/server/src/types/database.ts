/**
 * Database types
 */

export interface User {
  id: number;
  username: string;
  password: string;
  email?: string;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: number;
  title: string;
  description?: string;
  start_date: string;
  end_date?: string;
  user_id: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  content: string;
  user_id: number;
  created_at: string;
}
