;; Notifaya Donation Contract
;; Simple contract to receive 1 STX donations

;; Constants
(define-constant contract-owner tx-sender)
(define-constant donation-amount u1000000) ;; 1 STX in microSTX
(define-constant err-insufficient-amount (err u100))

;; Data variable to track total donations
(define-data-var total-donations uint u0)

;; Map to track individual donor contributions
(define-map donations principal uint)

;; Public function to donate 1 STX
(define-public (donate)
  (let (
        (donor tx-sender)
        (current-donation (default-to u0 (map-get? donations donor)))
       )

    ;; Ensure donor has enough STX (pre-check)
    (asserts!
      (>= (stx-get-balance donor) donation-amount)
      err-insufficient-amount
    )

    ;; Transfer 1 STX from donor to contract owner
    (try! (stx-transfer? donation-amount donor contract-owner))

    ;; Update donor's total donations
    (map-set donations donor (+ current-donation donation-amount))

    ;; Update total donations
    (var-set total-donations (+ (var-get total-donations) donation-amount))

    ;; Emit donation event for indexers / Chainhooks
    (print {
      event: "donation",
      from: donor,
      to: contract-owner,
      amount: donation-amount
    })

    (ok true)
  )
)

;; Read-only function to get total donations
(define-read-only (get-total-donations)
  (ok (var-get total-donations))
)

;; Read-only function to get donor's contribution
(define-read-only (get-donor-amount (donor principal))
  (ok (default-to u0 (map-get? donations donor)))
)