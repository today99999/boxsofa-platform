# BoxSofa conversion audit - 2026-07-23

## Scope

- Product page: `/product/chameleon-mario-sofa-01`
- Cart and checkout: `/cart`
- Desktop and 390 x 844 mobile viewport
- Commercial-policy consistency, first-viewport clarity, checkout usability and basic accessibility evidence

## Step results

1. **Commercial facts - Healthy**
   - Free basic delivery is presented across Europe.
   - Delivery remains 23-30 working days.
   - Stripe remains the only advertised payment provider.
   - The existing 14-day return window remains unchanged.

2. **Product first viewport - Improved**
   - Existing product video is now the default product media.
   - Customers can switch between video and photos without leaving the product page.
   - The product title, compressed-sofa description and trust information remain visible immediately below the media.

3. **Mobile navigation - Improved**
   - The three primary navigation links remain on one row at 390 px.
   - Header spacing and logo sizing are reduced without removing language or account access.

4. **Checkout - Healthy**
   - Delivery country is required and limited to the configured European delivery list.
   - The selected ISO country code is stored with the order.
   - Basic delivery displays as EUR 0.00.

5. **Support access - Improved**
   - Desktop checkout places the support control away from the submit button.
   - Mobile uses a deliberate bottom support bar with reserved page space.

6. **Accessibility evidence - Pass with limited scope**
   - Product media controls expose pressed state.
   - Product image navigation has English accessible labels.
   - Delivery country has a programmatic label.
   - Keyboard-only and screen-reader testing were not performed in this pass.

## Evidence

- `01-product-desktop.png`
- `02-cart-desktop.png`
- `03-product-mobile.png`
- `04-cart-mobile.png`

## Remaining operational item

Google Merchant shipping remains configured for Spain because Merchant Center requires country-specific shipping entries. Expand it country by country after confirming the first priority markets.
