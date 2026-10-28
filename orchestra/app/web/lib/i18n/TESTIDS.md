# T07 testids

 data-testid แยกตามหน้า

**ทุกหน้า (layout)**: `test-mode-banner` (data-value = ISO วันนี้) · `brand-link` · `nav-home` `nav-products` `nav-order` `nav-orders` `nav-claims` `nav-samples` `nav-staff-orders` `nav-staff-claims` `nav-preview` `nav-login` · `current-user` (data-role) · `lang-th` `lang-en` (aria-pressed) · `logout-button` · `not-found-message` · `forbidden-message`

**`/`**: `home-title` `home-order-link` `home-products-link` `hero-image` `factory-image`

**`/login`**: `login-form` `login-email` `login-password` `login-submit` `login-error`

**`/products`** (`<slug>` = `b100-clear` … `b500-amber`): `product-list` (data-count) · `product-card-<slug>` (data-model, data-color) · `product-image-<slug>` · `product-name-<slug>` · `product-size-<slug>` · `product-price-<slug>` · `product-min-<slug>` · `product-order-<slug>`

**`/order`**: `order-form` · `reorder-note` · `step-model` `model-B-100` `model-B-150` `model-B-250` `model-B-500` · `step-color` `color-options` `color-clear` `color-amber` `color-green` · `error-product` · `step-quantity` `quantity-input` `error-quantity` `upsell-warning` · `step-logo` `logo-checkbox` `error-logo` · `step-address` `address-select` `distance-input` `error-distance` `sales-contact` · `step-pickup` `pickup-date-input` `earliest-pickup` `error-pickup` `note-input` · `order-summary` (data-pending) `summary-product` `summary-pickup` `summary-empty` · บรรทัดเงิน (ด้านล่าง) · `payment-terms` (data-value prepay|credit30) `bank-account` `credit-status` (data-value = อีกกี่ออเดอร์, data-terms) · `confirm-order` · `submit-error` · `order-error` (เฉพาะ `DUPLICATE_ORDER` · `data-error-code` · ลิงก์ `existing-order-link`) · `order-success` `order-no` `view-order-link` · ทุก error มี `data-code`

**บรรทัดเงิน** (หน้าสั่งซื้อ · หน้าออเดอร์): `price-lines` · `row-bottles` `line-bottles` · `row-discount` `line-discount-label` `line-discount` (แสดง −฿…) · `row-logo` `line-logo-label` `line-logo` · `row-shipping` `line-shipping-label` `trips` `distance-km` `line-shipping` · `row-subtotal` `line-subtotal` · `row-vat` `line-vat-label` `line-vat` · `row-total` `line-total`

**`/orders`**: `credit-card` `credit-status` `shipped-count` `bank-account` `new-order-link` `orders-table` (data-count) `orders-empty` · ต่อแถว: `order-row-<no>` `order-link-<no>` `order-status-<no>` (data-value 1–6) `due-date` (data-state date|pending|none, data-value) `order-total-<no>`

**`/orders/[no]`**: `order-detail` (data-order-no) `order-title` `order-status` · `status-steps` (data-value) `status-step-1..6` (data-state done|current|todo) `status-step-N-time` · `order-quantity` `order-logo` `order-address` `order-distance` `order-pickup-date` `order-created-at` `order-reorder-of` · `payment-terms` `due-date` `payment-status` (paid|unpaid) `credit-status` · `reorder-button` `claim-button` `claim-until` `claim-window-error` · `order-history` (data-count) `order-history-row` (data-from, data-to) · `order-claims` `order-claim-<CL-no>` · `back-to-orders` · บรรทัดเงินตามด้านบน · (CR-01) `reschedule-button` (เฉพาะขั้น 1–2) `reschedule-dialog` `reschedule-date` (min) `reschedule-confirm` `reschedule-done` `reschedule-error` (data-error-code) · `pickup-changes` (data-count) `pickup-change-row` (data-from, data-to)

**`/orders/[no]/claim`**: `claim-title` `claim-until` `claim-remaining` (data-value) `claim-window-error` `claim-illustration` · `claim-form` `lot-input` `error-lot` `claim-quantity-input` `error-claim-quantity` `claim-description-input` `photo-input` `photo-list` (data-count) `photo-item-N` `photo-remove-N` `photo-hint` `error-photos` `error-claim` `submit-claim` · `claim-success` `claim-no` `view-claim-link`

**`/claims`**: `claims-table` (data-count) `claims-empty` `claim-row-<no>` `claim-link-<no>` `claim-status-<no>` (data-value)

**`/claims/[no]` และ `/staff/claims/[no]`**: `claim-detail` / `staff-claim-detail` · `claim-title` `claim-status` (data-value received|reviewing|approved|rejected) `claim-order-no` `claim-company` `claim-lot` `claim-quantity` `claim-reporter` `claim-created-at` `claim-description` `reject-reason` · `claim-photos` (data-count) `claim-photo-link-N` `claim-photo-N` · `claim-history` (data-count) `claim-history-row` (data-from, data-to) · `back-to-claims`
เฉพาะพนักงาน: `claim-actions` `start-review` `approve-claim` `reject-reason-input` `reject-reason-count` `reject-claim` `error-reason` `claim-no-actions`

**`/samples`**: `sample-form` `sample-item-N` `sample-model-N` `sample-color-N` `sample-quantity-N` `sample-remove-N` `sample-add-item` `error-sample-item` `error-sample` · `sample-totals` `sample-subtotal` `sample-vat` `sample-total` · `submit-sample` `sample-success` `sample-no` · `sample-quota` `quota-B-100` `quota-B-150` `quota-B-250` `quota-B-500` (data-value) · `sample-requests` `sample-request-<SR-no>`

**`/staff/orders` และ `/staff/orders/[no]`**: `status-filter` · `staff-orders-table` (data-count) `staff-order-row-<no>` (data-status) `staff-order-link-<no>` `staff-order-status-<no>` `payment-badge-<no>` (paid|unpaid) · `record-payment-<no>` · `advance-<no>` (data-to · ป้าย = ชื่อขั้นถัดไป) · `no-next-step-<no>` · `row-error-<no>` · หน้า detail: `staff-order-detail` `order-status` `order-history` `order-history-row` `payment-terms` `due-date` `payment-status` `order-note`

**`/staff/claims`**: `status-filter` `staff-claims-table` `staff-claim-row-<no>` `staff-claim-status-<no>` `staff-claim-open-<no>`

**`/preview`**: `preview-page` `swatch-primary` `swatch-cream` `swatch-amber` `preview-btn-primary` `preview-btn-secondary` `preview-btn-accent` `preview-btn-disabled` `preview-bottle-P01..P09`

**`/owner/report`** (CR-05): `owner-report` · `report-from` `report-to` (`<input type=date>`) `report-run` · `report-error` (data-error-code) · `report-count-1..6` (data-value) · `report-bottles` `report-discount` `report-logo` `report-shipping` `report-subtotal` `report-vat` `report-total` (= ยอดรวมขั้น 6) `report-pending` (data-value เงินดิบ) · `report-model-B-100..B-500` · `report-company-C01..C05` (data-value) · `report-csv` (ลิงก์ไป API `&format=csv`) · เมนู `nav-owner-report` (เจ้าของเท่านั้น)

**`/owner/holidays`** (CR-04 ส่วน ข): `owner-holidays` · `holidays-title` · `holiday-date` (`<input type=date>` min = พรุ่งนี้) `holiday-name-th` `holiday-name-en` `holiday-add` · `holiday-error` (data-error-code) · `holiday-row-YYYY-MM-DD` · `holiday-delete-YYYY-MM-DD` · `holiday-none` · เมนู `nav-owner-holidays` (เจ้าของเท่านั้น)

ทุกช่องกรอกมี `<label for>` · ทุกปุ่มมีข้อความหรือ `aria-label` (ปุ่ม TH/EN: "ภาษาไทย"/"English" หรือ "Thai"/"English") ให้ `getByRole` / `getByLabel` หาเจอ

---


เพิ่ม v3: `product-list` (`data-count`), `product-card` (`data-slug`), `quote-request`

## T07 implementation notes

- `order-confirm` is the v3 replacement for legacy `confirm-order`.
- Product cards expose both `product-card` (`data-slug`, `data-model`, `data-color`)
  and an inner `product-card-<slug>` for legacy selectors.
- Added filters: `product-model-filter`, `product-color-filter`.
- Shared language button is `lang-toggle` (T04), replacing `lang-th`/`lang-en`.
- `quote-request` posts the current order input to T08's quote API.
- Monetary `data-value` strings are unsigned raw snapshot amounts; the discount
  text is displayed with the minus sign. `line-shipping` adds `data-trips`.
- Native fieldset lock assertions use the `disabled` attribute and also assert
  every contained form control is disabled (Playwright does not treat a fieldset
  itself as a disabled control).
- The legacy catalog above is retained as the reference. Staff/owner/preview IDs
  belong to other workers; T07 only implements the customer sections.
