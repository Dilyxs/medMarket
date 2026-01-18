-- Solana Deposits Table
-- This prevents replay attacks by storing each transaction signature once

CREATE TABLE IF NOT EXISTS deposits (
    id SERIAL PRIMARY KEY,
    signature TEXT UNIQUE NOT NULL,
    user_wallet TEXT NOT NULL,
    lamports BIGINT NOT NULL,
    sol_amount DECIMAL(18, 9) NOT NULL,
    status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'failed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_deposits_user_wallet ON deposits(user_wallet);
CREATE INDEX idx_deposits_created_at ON deposits(created_at DESC);
CREATE INDEX idx_deposits_signature ON deposits(signature);

-- Optional: User credits table
CREATE TABLE IF NOT EXISTS user_credits (
    user_wallet TEXT PRIMARY KEY,
    balance_lamports BIGINT DEFAULT 0,
    balance_sol DECIMAL(18, 9) DEFAULT 0,
    total_deposited BIGINT DEFAULT 0,
    deposit_count INTEGER DEFAULT 0,
    last_deposit_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Example query to credit user after verification:
-- BEGIN;
-- INSERT INTO deposits (signature, user_wallet, lamports, sol_amount)
-- VALUES ($1, $2, $3, $4)
-- ON CONFLICT (signature) DO NOTHING
-- RETURNING id;
-- 
-- UPDATE user_credits 
-- SET balance_lamports = balance_lamports + $3,
--     balance_sol = balance_sol + $4,
--     total_deposited = total_deposited + $3,
--     deposit_count = deposit_count + 1,
--     last_deposit_at = NOW(),
--     updated_at = NOW()
-- WHERE user_wallet = $2;
-- COMMIT;

-- Example Go code to use this:
/*
import (
    "database/sql"
    _ "github.com/lib/pq"
)

func CreditDeposit(db *sql.DB, signature string, userWallet string, lamports int64) error {
    tx, err := db.Begin()
    if err != nil {
        return err
    }
    defer tx.Rollback()

    // Insert deposit (prevents replay if signature already exists)
    var depositID int
    err = tx.QueryRow(`
        INSERT INTO deposits (signature, user_wallet, lamports, sol_amount)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (signature) DO NOTHING
        RETURNING id
    `, signature, userWallet, lamports, float64(lamports)/1e9).Scan(&depositID)
    
    if err == sql.ErrNoRows {
        return fmt.Errorf("signature already used")
    }
    if err != nil {
        return err
    }

    // Update user credits
    _, err = tx.Exec(`
        INSERT INTO user_credits (user_wallet, balance_lamports, balance_sol, total_deposited, deposit_count, last_deposit_at)
        VALUES ($1, $2, $3, $2, 1, NOW())
        ON CONFLICT (user_wallet) DO UPDATE SET
            balance_lamports = user_credits.balance_lamports + $2,
            balance_sol = user_credits.balance_sol + $3,
            total_deposited = user_credits.total_deposited + $2,
            deposit_count = user_credits.deposit_count + 1,
            last_deposit_at = NOW(),
            updated_at = NOW()
    `, userWallet, lamports, float64(lamports)/1e9)
    
    if err != nil {
        return err
    }

    return tx.Commit()
}
*/
