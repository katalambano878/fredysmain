'use client';

import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    ReactNode,
} from 'react';

export type CartItem = {
    id: string;
    name: string;
    price: number;
    image: string;
    quantity: number;
    variant?: string;
    /** product_variants.id when a size/color option was selected */
    variantId?: string;
    slug: string;
    maxStock: number;
    moq?: number;
    isPreorder?: boolean;
};

type CartContextType = {
    cart: CartItem[];
    addToCart: (item: CartItem) => void;
    removeFromCart: (itemId: string, variant?: string) => void;
    updateQuantity: (itemId: string, quantity: number, variant?: string) => void;
    clearCart: () => void;
    cartCount: number;
    subtotal: number;
    isCartOpen: boolean;
    setIsCartOpen: (isOpen: boolean) => void;
    /** False until storage has been read */
    isHydrated: boolean;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_KEY = 'cart';
const CART_BACKUP_KEY = 'frebys_cart_v1';

function isValidUUID(str: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function persistCart(items: CartItem[]) {
    if (typeof window === 'undefined') return;
    const payload = JSON.stringify(items);
    try {
        localStorage.setItem(CART_KEY, payload);
        localStorage.setItem(CART_BACKUP_KEY, payload);
        sessionStorage.setItem(CART_BACKUP_KEY, payload);
        window.dispatchEvent(new Event('cartUpdated'));
    } catch {
        try {
            sessionStorage.setItem(CART_BACKUP_KEY, payload);
        } catch {
            /* private mode */
        }
    }
}

function sanitizeCart(parsed: unknown): CartItem[] {
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item: any) => {
        if (!item?.id || !item.name || item.price == null || Number(item.price) < 0) {
            return false;
        }
        if (!isValidUUID(String(item.id))) {
            console.warn(`Removing legacy cart item with non-UUID id: ${item.id}`);
            return false;
        }
        if (!item.slug) item.slug = item.id;
        item.price = Number(item.price);
        item.quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
        return true;
    });
}

export function readStoredCart(): CartItem[] {
    if (typeof window === 'undefined') return [];
    const sources = [
        () => localStorage.getItem(CART_KEY),
        () => localStorage.getItem(CART_BACKUP_KEY),
        () => sessionStorage.getItem(CART_BACKUP_KEY),
    ];
    for (const get of sources) {
        try {
            const raw = get();
            if (!raw) continue;
            const items = sanitizeCart(JSON.parse(raw));
            if (items.length > 0) return items;
            // empty array is a valid cleared cart — prefer primary key only
            if (get === sources[0]) return [];
        } catch {
            /* try next */
        }
    }
    return [];
}

function mergeAdd(prevCart: CartItem[], newItem: CartItem): CartItem[] {
    const existingItemIndex = prevCart.findIndex(
        (item) =>
            item.id === newItem.id &&
            item.variant === newItem.variant &&
            (item.variantId || '') === (newItem.variantId || '')
    );

    if (existingItemIndex > -1) {
        const next = [...prevCart];
        const existingItem = next[existingItemIndex];
        const newQuantity = Math.min(
            existingItem.quantity + newItem.quantity,
            existingItem.maxStock || newItem.maxStock || 50
        );
        next[existingItemIndex] = { ...existingItem, quantity: newQuantity };
        return next;
    }
    return [...prevCart, newItem];
}

export function CartProvider({ children }: { children: ReactNode }) {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isHydrated, setIsHydrated] = useState(false);
    const cartRef = useRef<CartItem[]>([]);

    useEffect(() => {
        const stored = readStoredCart();
        cartRef.current = stored;
        setCart(stored);
        if (stored.length > 0) persistCart(stored);
        setIsHydrated(true);
    }, []);

    const addToCart = (newItem: CartItem) => {
        // Persist BEFORE setState — React may defer the updater until after navigation
        const next = mergeAdd(cartRef.current, newItem);
        cartRef.current = next;
        persistCart(next);
        setCart(next);
        setIsCartOpen(true);
    };

    const removeFromCart = (itemId: string, variant?: string) => {
        const next = cartRef.current.filter(
            (item) => !(item.id === itemId && item.variant === variant)
        );
        cartRef.current = next;
        persistCart(next);
        setCart(next);
    };

    const updateQuantity = (itemId: string, quantity: number, variant?: string) => {
        const item = cartRef.current.find((i) => i.id === itemId && i.variant === variant);
        if (!item) return;

        const minQty = item.moq || 1;
        let next: CartItem[];
        if (quantity < minQty) {
            next = cartRef.current.filter(
                (i) => !(i.id === itemId && i.variant === variant)
            );
        } else {
            const clampedQty = Math.min(Math.max(quantity, minQty), item.maxStock);
            next = cartRef.current.map((i) =>
                i.id === itemId && i.variant === variant
                    ? { ...i, quantity: clampedQty }
                    : i
            );
        }
        cartRef.current = next;
        persistCart(next);
        setCart(next);
    };

    const clearCart = () => {
        cartRef.current = [];
        persistCart([]);
        setCart([]);
    };

    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    return (
        <CartContext.Provider
            value={{
                cart,
                addToCart,
                removeFromCart,
                updateQuantity,
                clearCart,
                cartCount,
                subtotal,
                isCartOpen,
                setIsCartOpen,
                isHydrated,
            }}
        >
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
}
