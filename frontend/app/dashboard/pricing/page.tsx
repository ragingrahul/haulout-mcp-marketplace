"use client";

import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { EndpointService, Endpoint } from "@/services/endpointService";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  Check,
  DollarSign,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useWallet } from "@suiet/wallet-kit";

export default function PricingManagementPage() {
  const { accessToken } = useAuth();
  const { address: connectedWalletAddress } = useWallet();

  // Data state
  const [allEndpoints, setAllEndpoints] = useState<Endpoint[]>([]);
  const [paidEndpoints, setPaidEndpoints] = useState<Endpoint[]>([]);
  const [freeEndpoints, setFreeEndpoints] = useState<Endpoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [isAddPricingDialogOpen, setIsAddPricingDialogOpen] = useState(false);
  const [isEditPricingDialogOpen, setIsEditPricingDialogOpen] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(
    null
  );

  // Form state
  const [pricePerCall, setPricePerCall] = useState("");
  const [developerWallet, setDeveloperWallet] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Fetch all endpoints
  useEffect(() => {
    const fetchEndpoints = async () => {
      if (!accessToken) return;

      try {
        setIsLoading(true);
        setError(null);
        const response = await EndpointService.getMyEndpoints(accessToken);

        if (response.success) {
          const endpoints = response.endpoints || [];
          setAllEndpoints(endpoints);

          // Separate paid and free endpoints
          const paid = endpoints.filter((ep) => ep.is_paid);
          const free = endpoints.filter((ep) => !ep.is_paid);

          setPaidEndpoints(paid);
          setFreeEndpoints(free);
        } else {
          setError(response.message || "Failed to load endpoints");
        }
      } catch (err) {
        const error = err as Error;
        setError(error.message || "Error loading endpoints");
        console.error("Error fetching endpoints:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEndpoints();
  }, [accessToken]);

  // Auto-populate wallet address
  useEffect(() => {
    if (connectedWalletAddress && !developerWallet) {
      setDeveloperWallet(connectedWalletAddress);
    }
  }, [connectedWalletAddress, developerWallet]);

  const handleAddPricing = (endpoint: Endpoint) => {
    setSelectedEndpoint(endpoint);
    setPricePerCall("");
    setDeveloperWallet(connectedWalletAddress || "");
    setIsAddPricingDialogOpen(true);
    setSuccess(false);
  };

  const handleEditPricing = (endpoint: Endpoint) => {
    setSelectedEndpoint(endpoint);
    setPricePerCall(endpoint.price_per_call_eth || "");
    setDeveloperWallet(
      endpoint.developer_wallet_address || connectedWalletAddress || ""
    );
    setIsEditPricingDialogOpen(true);
    setSuccess(false);
  };

  const handleSubmitPricing = async () => {
    if (!selectedEndpoint || !accessToken) return;

    // Validation
    if (!pricePerCall || parseFloat(pricePerCall) <= 0) {
      return;
    }
    if (!developerWallet.trim()) {
      return;
    }
    // Validate Sui address format (64 hex characters)
    if (!/^0x[a-fA-F0-9]{64}$/.test(developerWallet.trim())) {
      return;
    }

    try {
      setIsSubmitting(true);

      const updateData = {
        is_paid: true,
        price_per_call_eth: pricePerCall,
        developer_wallet_address: developerWallet.trim(),
      };

      const response = await EndpointService.updateEndpoint(
        accessToken,
        selectedEndpoint.id,
        updateData
      );

      if (response.success) {
        setSuccess(true);

        // Update local state
        const updatedEndpoint = { ...selectedEndpoint, ...updateData };
        setAllEndpoints(
          allEndpoints.map((ep) =>
            ep.id === selectedEndpoint.id ? updatedEndpoint : ep
          )
        );
        setPaidEndpoints([
          ...paidEndpoints.filter((ep) => ep.id !== selectedEndpoint.id),
          updatedEndpoint,
        ]);
        setFreeEndpoints(
          freeEndpoints.filter((ep) => ep.id !== selectedEndpoint.id)
        );

        setTimeout(() => {
          setIsAddPricingDialogOpen(false);
          setIsEditPricingDialogOpen(false);
          setSuccess(false);
        }, 1500);
      }
    } catch (err) {
      console.error("Error updating pricing:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemovePricing = async (endpoint: Endpoint) => {
    if (!accessToken) return;

    try {
      const updateData = {
        is_paid: false,
        price_per_call_eth: null,
        developer_wallet_address: null,
      };

      const response = await EndpointService.updateEndpoint(
        accessToken,
        endpoint.id,
        updateData
      );

      if (response.success) {
        // Update local state
        const updatedEndpoint = { ...endpoint, ...updateData };
        setAllEndpoints(
          allEndpoints.map((ep) =>
            ep.id === endpoint.id ? updatedEndpoint : ep
          )
        );
        setPaidEndpoints(paidEndpoints.filter((ep) => ep.id !== endpoint.id));
        setFreeEndpoints([...freeEndpoints, updatedEndpoint]);
      }
    } catch (err) {
      console.error("Error removing pricing:", err);
    }
  };

  return (
    <ProtectedRoute>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              <h1 className="text-lg font-semibold">Pricing Management</h1>
            </div>
          </header>

          <div className="flex flex-1 flex-col gap-4 p-4">
            {/* Header */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                Endpoint Pricing
              </h2>
              <p className="text-muted-foreground">
                Manage pricing for your endpoints and monetize your APIs
              </p>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900 dark:text-red-100">
                    Error
                  </p>
                  <p className="text-sm text-red-800 dark:text-red-200">
                    {error}
                  </p>
                </div>
              </div>
            )}

            {/* Paid Endpoints Section */}
            <Card>
              <CardHeader>
                <CardTitle>Paid Endpoints</CardTitle>
                <CardDescription>
                  Endpoints that charge users per API call
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : paidEndpoints.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <DollarSign className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No paid endpoints yet</p>
                    <p className="text-sm">
                      Add pricing to your free endpoints below
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {paidEndpoints.map((endpoint) => (
                      <div
                        key={endpoint.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{endpoint.name}</h3>
                            <Badge variant="default">
                              {endpoint.price_per_call_eth} SUI
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {endpoint.description || "No description"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Wallet:{" "}
                            {endpoint.developer_wallet_address?.slice(0, 6)}...
                            {endpoint.developer_wallet_address?.slice(-4)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditPricing(endpoint)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemovePricing(endpoint)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Free Endpoints Section */}
            <Card>
              <CardHeader>
                <CardTitle>Free Endpoints</CardTitle>
                <CardDescription>
                  Add pricing to monetize these endpoints
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : freeEndpoints.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No free endpoints available</p>
                    <p className="text-sm">All your endpoints are monetized!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {freeEndpoints.map((endpoint) => (
                      <div
                        key={endpoint.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{endpoint.name}</h3>
                            <Badge variant="secondary">Free</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {endpoint.description || "No description"}
                          </p>
                        </div>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleAddPricing(endpoint)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Pricing
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </SidebarInset>
      </SidebarProvider>

      {/* Add Pricing Dialog */}
      <Dialog
        open={isAddPricingDialogOpen}
        onOpenChange={setIsAddPricingDialogOpen}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Pricing</DialogTitle>
            <DialogDescription>
              Set a price for {selectedEndpoint?.name}
            </DialogDescription>
          </DialogHeader>

          {success && (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-start gap-2">
              <Check className="h-4 w-4 text-green-600 mt-0.5" />
              <p className="text-sm text-green-900 dark:text-green-100">
                Pricing added successfully!
              </p>
            </div>
          )}

          <div className="space-y-4">
            {/* Price per Call */}
            <div className="space-y-2">
              <Label htmlFor="price">
                Price per Call (SUI) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="price"
                type="number"
                step="0.0001"
                min="0"
                placeholder="0.001"
                value={pricePerCall}
                onChange={(e) => setPricePerCall(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Amount users will pay per API call
              </p>
            </div>

            {/* Developer Wallet Address */}
            <div className="space-y-2">
              <Label htmlFor="wallet">
                Your Wallet Address (Sui Network){" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="wallet"
                placeholder="0x..."
                value={developerWallet}
                onChange={(e) => setDeveloperWallet(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                {connectedWalletAddress
                  ? "Auto-filled with connected wallet"
                  : "Connect wallet to auto-fill"}
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                💡 <strong>Tip:</strong> Payments will be sent directly to your
                wallet on the Sui network when users call this endpoint.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddPricingDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmitPricing} disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add Pricing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Pricing Dialog */}
      <Dialog
        open={isEditPricingDialogOpen}
        onOpenChange={setIsEditPricingDialogOpen}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Pricing</DialogTitle>
            <DialogDescription>
              Update pricing for {selectedEndpoint?.name}
            </DialogDescription>
          </DialogHeader>

          {success && (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-start gap-2">
              <Check className="h-4 w-4 text-green-600 mt-0.5" />
              <p className="text-sm text-green-900 dark:text-green-100">
                Pricing updated successfully!
              </p>
            </div>
          )}

          <div className="space-y-4">
            {/* Price per Call */}
            <div className="space-y-2">
              <Label htmlFor="edit-price">
                Price per Call (SUI) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-price"
                type="number"
                step="0.0001"
                min="0"
                placeholder="0.001"
                value={pricePerCall}
                onChange={(e) => setPricePerCall(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {/* Developer Wallet Address */}
            <div className="space-y-2">
              <Label htmlFor="edit-wallet">
                Your Wallet Address (Sui Network){" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-wallet"
                placeholder="0x..."
                value={developerWallet}
                onChange={(e) => setDeveloperWallet(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                {connectedWalletAddress
                  ? "Connected wallet address"
                  : "Connect wallet to use your address"}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditPricingDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmitPricing} disabled={isSubmitting}>
              {isSubmitting ? "Updating..." : "Update Pricing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}
