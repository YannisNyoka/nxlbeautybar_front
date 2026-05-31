import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nxl_cart') || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('nxl_cart', JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((product, quantity = 1) => {
    setItems(prev => {
      const existing = prev.find(i => i.productId === product._id);
      if (existing) {
        return prev.map(i =>
          i.productId === product._id
            ? { ...i, quantity: Math.min(i.quantity + quantity, product.stock) }
            : i
        );
      }
      return [...prev, {
        productId: product._id,
        name:      product.name,
        price:     parseFloat(product.price),
        image:     (product.images || [])[0] || '',
        stock:     product.stock,
        quantity:  Math.min(quantity, product.stock),
      }];
    });
  }, []);

  const removeItem = useCallback((productId) => {
    setItems(prev => prev.filter(i => i.productId !== productId));
  }, []);

  const updateQuantity = useCallback((productId, quantity) => {
    if (quantity < 1) { removeItem(productId); return; }
    setItems(prev => prev.map(i =>
      i.productId === productId ? { ...i, quantity: Math.min(quantity, i.stock) } : i
    ));
  }, [removeItem]);

  const clearCart = useCallback(() => setItems([]), []);

  const itemCount   = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal    = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const shippingFee = subtotal >= 500 ? 0 : (items.length > 0 ? 80 : 0);
  const total       = subtotal + shippingFee;

  return (
    <CartContext.Provider value={{ items, itemCount, subtotal, shippingFee, total, addItem, removeItem, updateQuantity, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}