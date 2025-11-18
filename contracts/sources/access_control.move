/// Access Control Module
/// Manages ownership capabilities and permissions for marketplace features
module mcp_marketplace::access_control {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;

    /// Capability for endpoint ownership
    public struct EndpointOwnerCap has key, store {
        id: UID,
        endpoint_id: address,
        granted_at: u64,
    }

    /// Capability for marketplace admin operations
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Access grant for collaborative endpoints
    public struct AccessGrant has key, store {
        id: UID,
        endpoint_id: address,
        grantee: address,
        permissions: vector<u8>, // e.g., ["read", "execute", "modify"]
        granted_at: u64,
        expires_at: u64,
    }

    // ===== Events =====

    public struct OwnerCapCreated has copy, drop {
        cap_id: address,
        endpoint_id: address,
        owner: address,
        timestamp: u64,
    }

    public struct AccessGranted has copy, drop {
        endpoint_id: address,
        grantee: address,
        grantor: address,
        timestamp: u64,
    }

    public struct AccessRevoked has copy, drop {
        endpoint_id: address,
        grantee: address,
        timestamp: u64,
    }

    // ===== Error Codes =====

    const E_NOT_AUTHORIZED: u64 = 1;
    const E_INVALID_ENDPOINT: u64 = 2;
    const E_ACCESS_EXPIRED: u64 = 3;

    // ===== Public Functions =====

    /// Create owner capability for an endpoint
    public fun create_owner_cap(
        endpoint_id: address,
        timestamp: u64,
        ctx: &mut TxContext
    ): EndpointOwnerCap {
        let owner = tx_context::sender(ctx);
        let cap_uid = object::new(ctx);
        let cap_id = object::uid_to_address(&cap_uid);

        event::emit(OwnerCapCreated {
            cap_id,
            endpoint_id,
            owner,
            timestamp,
        });

        EndpointOwnerCap {
            id: cap_uid,
            endpoint_id,
            granted_at: timestamp,
        }
    }

    /// Grant access to an endpoint
    public entry fun grant_access(
        endpoint_id: address,
        grantee: address,
        permissions: vector<u8>,
        expires_at: u64,
        ctx: &mut TxContext
    ) {
        let grantor = tx_context::sender(ctx);
        let timestamp = tx_context::epoch(ctx);

        let grant = AccessGrant {
            id: object::new(ctx),
            endpoint_id,
            grantee,
            permissions,
            granted_at: timestamp,
            expires_at,
        };

        event::emit(AccessGranted {
            endpoint_id,
            grantee,
            grantor,
            timestamp,
        });

        transfer::transfer(grant, grantee);
    }

    /// Revoke access (delete the grant)
    public entry fun revoke_access(
        grant: AccessGrant,
        ctx: &mut TxContext
    ) {
        let AccessGrant { 
            id, 
            endpoint_id, 
            grantee, 
            permissions: _, 
            granted_at: _, 
            expires_at: _ 
        } = grant;

        event::emit(AccessRevoked {
            endpoint_id,
            grantee,
            timestamp: tx_context::epoch(ctx),
        });

        object::delete(id);
    }

    /// Transfer owner capability
    public entry fun transfer_owner_cap(
        cap: EndpointOwnerCap,
        recipient: address,
    ) {
        transfer::transfer(cap, recipient);
    }

    /// Verify ownership (returns true if caller owns the capability)
    public fun verify_owner(
        cap: &EndpointOwnerCap,
        endpoint_id: address
    ): bool {
        cap.endpoint_id == endpoint_id
    }

    /// Check if access is still valid
    public fun is_access_valid(
        grant: &AccessGrant,
        current_time: u64
    ): bool {
        grant.expires_at == 0 || current_time < grant.expires_at
    }

    // ===== View Functions =====

    public fun get_endpoint_id(cap: &EndpointOwnerCap): address {
        cap.endpoint_id
    }

    public fun get_grant_endpoint(grant: &AccessGrant): address {
        grant.endpoint_id
    }

    public fun get_grantee(grant: &AccessGrant): address {
        grant.grantee
    }

    public fun get_permissions(grant: &AccessGrant): vector<u8> {
        grant.permissions
    }
}

