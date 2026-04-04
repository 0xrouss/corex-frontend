# Lessons

- When using the raw `viem` public client in the frontend, `waitForTransactionReceipt()` does not fail on a reverted receipt by itself in this flow. Always check `receipt.status` and fail closed before any dependent side effect, especially before TEE calls like `syncDeposit()` or before finalization steps that consume signatures/nonces.
- When the user asks for “balances” on the deposit page, clarify whether they mean TEE session balances or the wallet’s on-chain token balance. For deposit UX, the source-of-funds balance on-chain must be visible in the deposit panel, not just the post-sync balance inside the TEE.
- When extracting TEE instruction ids in the frontend, never rely on receipt log position alone. Read the deployed `teeExtensionRegistry()` address from the instruction sender and match that registry log explicitly before falling back to any positional heuristic.
