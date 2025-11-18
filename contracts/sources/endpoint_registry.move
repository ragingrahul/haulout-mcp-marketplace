/// Endpoint Registry Module
/// Manages API endpoint ownership, pricing, and lifecycle on Sui blockchain
module mcp_marketplace::endpoint_registry {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::clock::{Self, Clock};

    /// Endpoint NFT - represents ownership of an API endpoint
    public struct Endpoint has key, store {
        id: UID,
        owner: address,
        walrus_blob_id: vector<u8>,  // Points to Walrus storage
        price_per_call: u64,         // In MIST (1 SUI = 1B MIST)
        total_calls: u64,
        active: bool,
        created_at: u64,             // Timestamp in milliseconds
    }

    /// Capability to prove ownership of an endpoint
    public struct EndpointOwnerCap has key, store {
        id: UID,
        endpoint_id: address,
    }

    // ===== Events =====

    public struct EndpointCreated has copy, drop {
        endpoint_id: address,
        owner: address,
        walrus_blob_id: vector<u8>,
        price_per_call: u64,
        timestamp: u64,
    }

    public struct PricingUpdated has copy, drop {
        endpoint_id: address,
        old_price: u64,
        new_price: u64,
        timestamp: u64,
    }

    public struct EndpointCalled has copy, drop {
        endpoint_id: address,
        caller: address,
        total_calls: u64,
        timestamp: u64,
    }

    public struct EndpointDeactivated has copy, drop {
        endpoint_id: address,
        timestamp: u64,
    }

    public struct WalrusBlobUpdated has copy, drop {
        endpoint_id: address,
        old_blob_id: vector<u8>,
        new_blob_id: vector<u8>,
        timestamp: u64,
    }

    // ===== Error Codes =====

    const E_NOT_OWNER: u64 = 1;
    const E_ENDPOINT_INACTIVE: u64 = 2;
    const E_INVALID_PRICE: u64 = 3;
    const E_INVALID_BLOB_ID: u64 = 4;

    // ===== Public Functions =====

    /// Create a new endpoint
    /// Returns the Endpoint object as a shared object for marketplace access
    public entry fun create_endpoint(
        walrus_blob_id: vector<u8>,
        price_per_call: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(vector::length(&walrus_blob_id) > 0, E_INVALID_BLOB_ID);

        let sender = tx_context::sender(ctx);
        let endpoint_uid = object::new(ctx);
        let endpoint_id = object::uid_to_address(&endpoint_uid);
        let timestamp = clock::timestamp_ms(clock);

        let endpoint = Endpoint {
            id: endpoint_uid,
            owner: sender,
            walrus_blob_id,
            price_per_call,
            total_calls: 0,
            active: true,
            created_at: timestamp,
        };

        event::emit(EndpointCreated {
            endpoint_id,
            owner: sender,
            walrus_blob_id,
            price_per_call,
            timestamp,
        });

        // Share the endpoint object so anyone can read it (marketplace model)
        transfer::share_object(endpoint);
    }

    /// Update endpoint pricing (owner only)
    public entry fun update_pricing(
        endpoint: &mut Endpoint,
        new_price: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(endpoint.owner == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(endpoint.active, E_ENDPOINT_INACTIVE);

        let old_price = endpoint.price_per_call;
        endpoint.price_per_call = new_price;

        event::emit(PricingUpdated {
            endpoint_id: object::uid_to_address(&endpoint.id),
            old_price,
            new_price,
            timestamp: clock::timestamp_ms(clock),
        });
    }

    /// Update Walrus blob ID (for endpoint updates)
    public entry fun update_walrus_blob(
        endpoint: &mut Endpoint,
        new_blob_id: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(endpoint.owner == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(endpoint.active, E_ENDPOINT_INACTIVE);
        assert!(vector::length(&new_blob_id) > 0, E_INVALID_BLOB_ID);

        let old_blob_id = endpoint.walrus_blob_id;
        endpoint.walrus_blob_id = new_blob_id;

        event::emit(WalrusBlobUpdated {
            endpoint_id: object::uid_to_address(&endpoint.id),
            old_blob_id,
            new_blob_id,
            timestamp: clock::timestamp_ms(clock),
        });
    }

    /// Increment call counter (called after successful API invocation)
    public entry fun increment_call_count(
        endpoint: &mut Endpoint,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(endpoint.active, E_ENDPOINT_INACTIVE);

        endpoint.total_calls = endpoint.total_calls + 1;

        event::emit(EndpointCalled {
            endpoint_id: object::uid_to_address(&endpoint.id),
            caller: tx_context::sender(ctx),
            total_calls: endpoint.total_calls,
            timestamp: clock::timestamp_ms(clock),
        });
    }

    /// Deactivate endpoint (soft delete for audit trail)
    public entry fun deactivate_endpoint(
        endpoint: &mut Endpoint,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(endpoint.owner == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(endpoint.active, E_ENDPOINT_INACTIVE);

        endpoint.active = false;

        event::emit(EndpointDeactivated {
            endpoint_id: object::uid_to_address(&endpoint.id),
            timestamp: clock::timestamp_ms(clock),
        });
    }

    /// Transfer endpoint ownership
    public entry fun transfer_ownership(
        endpoint: &mut Endpoint,
        new_owner: address,
        ctx: &mut TxContext
    ) {
        assert!(endpoint.owner == tx_context::sender(ctx), E_NOT_OWNER);
        endpoint.owner = new_owner;
    }

    // ===== View Functions =====

    public fun get_owner(endpoint: &Endpoint): address {
        endpoint.owner
    }

    public fun get_walrus_blob_id(endpoint: &Endpoint): vector<u8> {
        endpoint.walrus_blob_id
    }

    public fun get_price_per_call(endpoint: &Endpoint): u64 {
        endpoint.price_per_call
    }

    public fun get_total_calls(endpoint: &Endpoint): u64 {
        endpoint.total_calls
    }

    public fun is_active(endpoint: &Endpoint): bool {
        endpoint.active
    }

    public fun get_created_at(endpoint: &Endpoint): u64 {
        endpoint.created_at
    }
}

