"use client";

import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import {
  EndpointService,
  Endpoint,
  EndpointParameter,
} from "@/services/endpointService";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  Check,
  Edit,
  Trash2,
  Plus,
  Code2,
  Copy,
} from "lucide-react";
import Link from "next/link";

export default function ManageEndpointsPage() {
  const { accessToken } = useAuth();

  // Data state
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<Endpoint | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    url: "",
    method: "GET",
  });
  const [parameters, setParameters] = useState<EndpointParameter[]>([
    { name: "", type: "string", required: false, description: "" },
  ]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  // Delete dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingEndpoint, setDeletingEndpoint] = useState<Endpoint | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  // Copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch endpoints
  useEffect(() => {
    const fetchEndpoints = async () => {
      if (!accessToken) return;

      try {
        setIsLoading(true);
        setError(null);
        const response = await EndpointService.getMyEndpoints(accessToken);

        if (response.success) {
          setEndpoints(response.endpoints || []);
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

  // Parameter management functions
  const addParameter = () => {
    setParameters([
      ...parameters,
      { name: "", type: "string", required: false, description: "" },
    ]);
  };

  const updateParameter = (
    index: number,
    field: keyof EndpointParameter,
    value: string | boolean
  ) => {
    const updated = [...parameters];
    updated[index] = { ...updated[index], [field]: value };
    setParameters(updated);
  };

  const removeParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index));
  };

  const handleEditClick = (endpoint: Endpoint) => {
    setEditingEndpoint(endpoint);
    setEditForm({
      name: endpoint.name,
      description: endpoint.description || "",
      url: endpoint.url,
      method: endpoint.method,
    });

    // Set parameters
    if (endpoint.parameters && endpoint.parameters.length > 0) {
      setParameters(endpoint.parameters);
    } else {
      setParameters([
        { name: "", type: "string", required: false, description: "" },
      ]);
    }

    setIsEditDialogOpen(true);
    setUpdateSuccess(false);
  };

  const handleEditSubmit = async () => {
    if (!editingEndpoint || !accessToken) return;

    // Validation
    if (!editForm.name.trim() || !editForm.url.trim()) {
      return;
    }

    // Validate endpoint name format (lowercase with underscores only)
    const nameRegex = /^[a-z][a-z0-9_]*$/;
    if (!nameRegex.test(editForm.name.trim())) {
      return;
    }

    try {
      setIsUpdating(true);

      // Filter out empty parameters
      const validParameters = parameters.filter((p) => p.name.trim());

      const updateData = {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        url: editForm.url.trim(),
        method: editForm.method,
        parameters: validParameters.length > 0 ? validParameters : undefined,
      };

      const response = await EndpointService.updateEndpoint(
        accessToken,
        editingEndpoint.id,
        updateData
      );

      if (response.success) {
        setUpdateSuccess(true);
        // Update local state
        setEndpoints(
          endpoints.map((ep) =>
            ep.id === editingEndpoint.id ? { ...ep, ...editForm } : ep
          )
        );
        setTimeout(() => {
          setIsEditDialogOpen(false);
          setUpdateSuccess(false);
        }, 1500);
      }
    } catch (err) {
      console.error("Error updating endpoint:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteClick = (endpoint: Endpoint) => {
    setDeletingEndpoint(endpoint);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingEndpoint || !accessToken) return;

    try {
      setIsDeleting(true);
      const response = await EndpointService.deleteEndpoint(
        accessToken,
        deletingEndpoint.name
      );

      if (response.success) {
        // Remove from local state
        setEndpoints(endpoints.filter((ep) => ep.id !== deletingEndpoint.id));
        setIsDeleteDialogOpen(false);
      }
    } catch (err) {
      console.error("Error deleting endpoint:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <ProtectedRoute>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b">
            <div className="flex items-center gap-2 px-4 w-full">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-[orientation=vertical]:h-4"
              />
              <div className="flex-1">
                <h1 className="text-xl font-semibold">Manage Endpoints</h1>
                <p className="text-xs text-muted-foreground">
                  View, edit, and manage your API endpoints
                </p>
              </div>
              <Link href="/dashboard/endpoints/create">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create New
                </Button>
              </Link>
            </div>
          </header>

          <div className="flex flex-1 flex-col gap-4 p-4">
            {/* Error Message */}
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Loading State */}
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-4 w-full" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-4 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : endpoints.length === 0 ? (
              /* Empty State */
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Code2 className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No endpoints yet</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create your first endpoint to get started
                  </p>
                  <Link href="/dashboard/endpoints/create">
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Endpoint
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              /* Endpoints List */
              <div className="space-y-4">
                {endpoints.map((endpoint) => (
                  <Card key={endpoint.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="flex items-center gap-2 flex-wrap">
                            <Code2 className="h-5 w-5" />
                            {endpoint.name}
                            <Badge variant="outline">{endpoint.method}</Badge>
                          </CardTitle>
                          {endpoint.description && (
                            <CardDescription className="mt-1">
                              {endpoint.description}
                            </CardDescription>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleEditClick(endpoint)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleDeleteClick(endpoint)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* URL */}
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                          Endpoint URL:
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-xs bg-muted p-2 rounded break-all">
                            {endpoint.url}
                          </code>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() =>
                              copyToClipboard(endpoint.url, endpoint.id)
                            }
                          >
                            {copiedId === endpoint.id ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Metadata */}
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <div>
                          Created:{" "}
                          {new Date(endpoint.created_at).toLocaleDateString()}
                        </div>
                        <div>
                          Updated:{" "}
                          {new Date(endpoint.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Endpoint
            </DialogTitle>
            <DialogDescription>
              Update the details of your endpoint
            </DialogDescription>
          </DialogHeader>

          {updateSuccess && (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-start gap-2">
              <Check className="h-4 w-4 text-green-600 mt-0.5" />
              <p className="text-sm text-green-900 dark:text-green-100">
                Endpoint updated successfully!
              </p>
            </div>
          )}

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-name">
                Endpoint Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-name"
                placeholder="e.g., get_user_data, weather_api"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                disabled={isUpdating}
              />
              <p className="text-xs text-muted-foreground">
                Use lowercase letters, numbers, and underscores only (no spaces)
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
                disabled={isUpdating}
                rows={3}
              />
            </div>

            {/* URL */}
            <div className="space-y-2">
              <Label htmlFor="edit-url">
                Endpoint URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-url"
                type="url"
                value={editForm.url}
                onChange={(e) =>
                  setEditForm({ ...editForm, url: e.target.value })
                }
                disabled={isUpdating}
              />
            </div>

            {/* Method */}
            <div className="space-y-2">
              <Label htmlFor="edit-method">HTTP Method</Label>
              <Select
                value={editForm.method}
                onValueChange={(value) =>
                  setEditForm({ ...editForm, method: value })
                }
                disabled={isUpdating}
              >
                <SelectTrigger id="edit-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Parameters Section */}
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Parameters</h3>
                <p className="text-xs text-muted-foreground">
                  Define parameters that users can pass to this endpoint
                </p>
              </div>

              {parameters.map((param, index) => (
                <div
                  key={index}
                  className="space-y-3 p-4 border rounded-lg bg-muted/30"
                >
                  {/* Parameter Name */}
                  <div className="space-y-2">
                    <Label htmlFor={`edit-param-name-${index}`}>
                      Parameter Name
                    </Label>
                    <Input
                      id={`edit-param-name-${index}`}
                      placeholder="e.g., user_id, query"
                      value={param.name}
                      onChange={(e) =>
                        updateParameter(index, "name", e.target.value)
                      }
                      disabled={isUpdating}
                    />
                  </div>

                  {/* Parameter Type */}
                  <div className="space-y-2">
                    <Label htmlFor={`edit-param-type-${index}`}>Type</Label>
                    <Select
                      value={param.type}
                      onValueChange={(value) =>
                        updateParameter(
                          index,
                          "type",
                          value as EndpointParameter["type"]
                        )
                      }
                      disabled={isUpdating}
                    >
                      <SelectTrigger id={`edit-param-type-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="string">String</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="boolean">Boolean</SelectItem>
                        <SelectItem value="object">Object</SelectItem>
                        <SelectItem value="array">Array</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Parameter Description */}
                  <div className="space-y-2">
                    <Label htmlFor={`edit-param-desc-${index}`}>
                      Description
                    </Label>
                    <Input
                      id={`edit-param-desc-${index}`}
                      placeholder="What this parameter does"
                      value={param.description || ""}
                      onChange={(e) =>
                        updateParameter(index, "description", e.target.value)
                      }
                      disabled={isUpdating}
                    />
                  </div>

                  {/* Required Checkbox */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`edit-param-required-${index}`}
                        checked={param.required}
                        onChange={(e) =>
                          updateParameter(index, "required", e.target.checked)
                        }
                        disabled={isUpdating}
                        className="rounded border-gray-300"
                      />
                      <Label
                        htmlFor={`edit-param-required-${index}`}
                        className="font-normal cursor-pointer"
                      >
                        Required parameter
                      </Label>
                    </div>

                    {parameters.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeParameter(index)}
                        disabled={isUpdating}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addParameter}
                disabled={isUpdating}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Parameter
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button onClick={handleEditSubmit} disabled={isUpdating}>
              {isUpdating ? "Updating..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingEndpoint?.name}
              &quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProtectedRoute>
  );
}
