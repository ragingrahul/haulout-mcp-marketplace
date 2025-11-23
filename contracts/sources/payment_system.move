/// Payment System Module
/// Handles deposits, payments, and balance tracking for the MCP marketplace
module mcp_marketplace::payment_system {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;
    use sui::clock::{Self, Clock};
    use mcp_marketplace::endpoint_registry::{Self, Endpoint};

    /// User's balance tracking object
    public struct UserBalance has key {
        id: UID,
        owner: address,
        total_deposited: u64,    // Total SUI deposited (in MIST)
        total_spent: u64,        // Total SUI spent on API calls
        created_at: u64,
    }

    /// Payment record for audit trail
    public struct PaymentRecord has key, store {
        id: UID,
        payer: address,
        endpoint_id: address,
        endpoint_owner: address,
        amount: u64,             // In MIST
        timestamp: u64,
    }

    // ===== Events =====

    public struct FundsDeposited has copy, drop {
        user: address,
        amount: u64,
        new_total: u64,
        timestamp: u64,
    }

    public struct PaymentProcessed has copy, drop {
        payment_id: address,
        payer: address,
        recipient: address,
        endpoint_id: address,
        amount: u64,
        timestamp: u64,
    }

    public struct FundsWithdrawn has copy, drop {
        user: address,
        amount: u64,
        timestamp: u64,
    }

    public struct BalanceCreated has copy, drop {
        user: address,
        timestamp: u64,
    }

    // ===== Error Codes =====

    const E_INSUFFICIENT_PAYMENT: u64 = 1;
    const E_ENDPOINT_INACTIVE: u64 = 2;
    const E_NOT_OWNER: u64 = 3;
    const E_INVALID_AMOUNT: u64 = 4;

    // ===== Public Functions =====

    /// Create a new user balance tracker
    /// This is a SHARED object so platform can modify it on behalf of user
    public entry fun create_balance(
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let timestamp = clock::timestamp_ms(clock);

        let balance = UserBalance {
            id: object::new(ctx),
            owner: sender,
            total_deposited: 0,
            total_spent: 0,
            created_at: timestamp,
        };

        event::emit(BalanceCreated {
            user: sender,
            timestamp,
        });

        // Share the object instead of transferring to owner
        // This allows platform to modify it on behalf of user
        transfer::share_object(balance);
    }

    /// Deposit funds into user's balance (custodial - held in UserBalance object)
    public entry fun deposit_funds(
        balance: &mut UserBalance,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(balance.owner == sender, E_NOT_OWNER);

        let amount = coin::value(&payment);
        assert!(amount > 0, E_INVALID_AMOUNT);

        balance.total_deposited = balance.total_deposited + amount;

        // IMPORTANT: For custodial system, coins stay in the balance object
        // Transfer the coins to the platform or hold in a treasury
        // For now, transfer to balance owner (user retains control but tracks deposit)
        transfer::public_transfer(payment, sender);

        event::emit(FundsDeposited {
            user: sender,
            amount,
            new_total: balance.total_deposited,
            timestamp: clock::timestamp_ms(clock),
        });
    }

    /// Process payment for API call
    /// Transfers SUI from payer to endpoint owner
    public entry fun process_payment(
        endpoint: &mut Endpoint,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // Verify endpoint is active
        assert!(endpoint_registry::is_active(endpoint), E_ENDPOINT_INACTIVE);

        // Get payment details
        let price = endpoint_registry::get_price_per_call(endpoint);
        let amount = coin::value(&payment);
        let payer = tx_context::sender(ctx);
        let recipient = endpoint_registry::get_owner(endpoint);

        // Verify sufficient payment
        assert!(amount >= price, E_INSUFFICIENT_PAYMENT);

        // Increment call counter
        endpoint_registry::increment_call_count(endpoint, clock, ctx);

        // Transfer payment to endpoint owner
        transfer::public_transfer(payment, recipient);

        // Create payment record
        let payment_uid = object::new(ctx);
        let payment_id = object::uid_to_address(&payment_uid);
        let timestamp = clock::timestamp_ms(clock);

        let record = PaymentRecord {
            id: payment_uid,
            payer,
            endpoint_id: object::id_address(endpoint),
            endpoint_owner: recipient,
            amount,
            timestamp,
        };

        event::emit(PaymentProcessed {
            payment_id,
            payer,
            recipient,
            endpoint_id: object::id_address(endpoint),
            amount,
            timestamp,
        });

        // Share payment record for transparency
        transfer::share_object(record);
    }

    /// Update spending tracker after payment
    public entry fun update_spending(
        balance: &mut UserBalance,
        amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(balance.owner == tx_context::sender(ctx), E_NOT_OWNER);
        balance.total_spent = balance.total_spent + amount;
    }

    /// Pay for endpoint using pre-authorized balance (for custodial system)
    /// Platform calls this on behalf of user after verifying off-chain balance
    /// User must have sufficient deposited funds tracked in UserBalance
    public entry fun pay_for_endpoint(
        user_balance: &mut UserBalance,
        endpoint: &mut Endpoint,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // Verify endpoint is active
        assert!(endpoint_registry::is_active(endpoint), E_ENDPOINT_INACTIVE);

        let price = endpoint_registry::get_price_per_call(endpoint);
        let amount = coin::value(&payment);
        let payer = user_balance.owner;
        let recipient = endpoint_registry::get_owner(endpoint);

        // Verify sufficient payment
        assert!(amount >= price, E_INSUFFICIENT_PAYMENT);

        // Update spending tracker
        user_balance.total_spent = user_balance.total_spent + amount;

        // Verify user has sufficient deposited funds
        assert!(
            user_balance.total_deposited >= user_balance.total_spent,
            E_INSUFFICIENT_PAYMENT
        );

        // Increment call counter
        endpoint_registry::increment_call_count(endpoint, clock, ctx);

        // Transfer payment to endpoint owner
        transfer::public_transfer(payment, recipient);

        // Create payment record
        let payment_uid = object::new(ctx);
        let payment_id = object::uid_to_address(&payment_uid);
        let timestamp = clock::timestamp_ms(clock);

        let record = PaymentRecord {
            id: payment_uid,
            payer,
            endpoint_id: object::id_address(endpoint),
            endpoint_owner: recipient,
            amount,
            timestamp,
        };

        event::emit(PaymentProcessed {
            payment_id,
            payer,
            recipient,
            endpoint_id: object::id_address(endpoint),
            amount,
            timestamp,
        });

        // Share payment record for transparency
        transfer::share_object(record);
    }

    // ===== View Functions =====

    public fun get_total_deposited(balance: &UserBalance): u64 {
        balance.total_deposited
    }

    public fun get_total_spent(balance: &UserBalance): u64 {
        balance.total_spent
    }

    public fun get_balance_owner(balance: &UserBalance): address {
        balance.owner
    }

    public fun get_payment_amount(record: &PaymentRecord): u64 {
        record.amount
    }

    public fun get_payment_payer(record: &PaymentRecord): address {
        record.payer
    }

    public fun get_payment_endpoint(record: &PaymentRecord): address {
        record.endpoint_id
    }
}

