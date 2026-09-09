// Product identity is kept outside the application entrypoint so route
// modules never need to import `main.tsx` and create a dev-time cycle.
export const PRODUCT_NAME = "Event Booking Platform";
