/**
 * A small Redux Toolkit (RTK) cart slice. This is the host's existing
 * store — no acture imports here. Exactly the shape an `actureMiddleware`
 * adopter would encounter on day zero.
 */

import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface CartItem {
  id: string;
  name: string;
  qty: number;
}

export interface CartState {
  items: CartItem[];
  couponCode: string | null;
}

const initialState: CartState = {
  items: [],
  couponCode: null,
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addItem(state, action: PayloadAction<{ id: string; name: string; qty?: number }>) {
      const existing = state.items.find((i) => i.id === action.payload.id);
      if (existing) {
        existing.qty += action.payload.qty ?? 1;
      } else {
        state.items.push({ id: action.payload.id, name: action.payload.name, qty: action.payload.qty ?? 1 });
      }
    },
    removeItem(state, action: PayloadAction<{ id: string }>) {
      state.items = state.items.filter((i) => i.id !== action.payload.id);
    },
    setQty(state, action: PayloadAction<{ id: string; qty: number }>) {
      const item = state.items.find((i) => i.id === action.payload.id);
      if (item) item.qty = Math.max(0, action.payload.qty);
    },
    applyCoupon(state, action: PayloadAction<{ code: string }>) {
      state.couponCode = action.payload.code;
    },
    clearCart() {
      return initialState;
    },
  },
});

export const cartActions = cartSlice.actions;

export function createCartStore(extraMiddleware: unknown[] = []) {
  return configureStore({
    reducer: { cart: cartSlice.reducer },
    middleware: (getDefault) =>
      getDefault().concat(extraMiddleware as never[]),
  });
}

export type CartStore = ReturnType<typeof createCartStore>;
export type RootState = ReturnType<CartStore['getState']>;
