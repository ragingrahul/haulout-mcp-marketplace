"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { EndpointService, EndpointParameter } from "@/services/endpointService";
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
import { AlertCircle, Check, Plus, Code2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function CreateEndpointPage() {
  const { accessToken } = useAuth();
  const router = useRouter();

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("GET");
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>(
    [{ key: "", value: "" }]
  );
  const [responseType, setResponseType] = useState("json");
  const [parameters, setParameters] = useState<EndpointParameter[]>([
    { name: "", type: "string", required: false, description: "" },
  ]);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const addHeader = () => {
    setHeaders([...headers, { key: "", value: "" }]);
  };

  const updateHeader = (
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    const newHeaders = [...headers];
    newHeaders[index][field] = value;
    setHeaders(newHeaders);
  };

  const removeHeader = (index: number) => {
    if (headers.length > 1) {
      setHeaders(headers.filter((_, i) => i !== index));
    }
  };

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
    const newParams = [...parameters];
    newParams[index] = {
      ...newParams[index],
      [field]: value,
    };
    setParameters(newParams);
  };

  const removeParameter = (index: number) => {
    if (parameters.length > 1) {
      setParameters(parameters.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!accessToken) {
      setError("Please login to create an endpoint");
      return;
    }

    // Validation
    if (!name.trim()) {
      setError("Endpoint name is required");
      return;
    }

    // Validate endpoint name format (lowercase with underscores only)
    const nameRegex = /^[a-z][a-z0-9_]*$/;
    if (!nameRegex.test(name.trim())) {
      setError(
        "Endpoint name must be lowercase letters, numbers, and underscores only (e.g., get_user_data, weather_api)"
      );
      return;
    }

    if (!url.trim()) {
      setError("Endpoint URL is required");
      return;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      setError("Please enter a valid URL (e.g., https://api.example.com/data)");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      // Filter out empty headers
      const validHeaders = headers
        .filter((h) => h.key.trim() && h.value.trim())
        .reduce((acc, h) => ({ ...acc, [h.key]: h.value }), {});

      // Filter out empty parameters
      const validParameters = parameters.filter((p) => p.name.trim());

      const endpointData = {
        name: name.trim(),
        description: description.trim() || undefined,
        url: url.trim(),
        method,
        headers:
          Object.keys(validHeaders).length > 0 ? validHeaders : undefined,
        parameters: validParameters.length > 0 ? validParameters : undefined,
        response_type: responseType,
      };

      const response = await EndpointService.createEndpoint(
        accessToken,
        endpointData
      );

      if (response.success) {
        setSuccess(true);
        // Reset form
        setName("");
        setDescription("");
        setUrl("");
        setMethod("GET");
        setHeaders([{ key: "", value: "" }]);
        setParameters([
          { name: "", type: "string", required: false, description: "" },
        ]);
        setResponseType("json");

        // Redirect to manage endpoints after 2 seconds
        setTimeout(() => {
          router.push("/dashboard/endpoints/manage");
        }, 2000);
      } else {
        setError(response.message || "Failed to create endpoint");
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || "Error creating endpoint");
      console.error("Error creating endpoint:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ProtectedRoute>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-[orientation=vertical]:h-4"
              />
              <div>
                <h1 className="text-xl font-semibold">Create Endpoint</h1>
                <p className="text-xs text-muted-foreground">
                  Add a new API endpoint to your collection
                </p>
              </div>
            </div>
          </header>

          <div className="flex flex-1 flex-col gap-4 p-4">
            {/* Success/Error Messages */}
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-start gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5" />
                <p className="text-sm text-green-900 dark:text-green-100">
                  Endpoint created successfully! Redirecting to manage
                  endpoints...
                </p>
              </div>
            )}

            {/* Create Endpoint Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Code2 className="h-5 w-5" />
                    Basic Information
                  </CardTitle>
                  <CardDescription>
                    Define the basic details of your API endpoint
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Endpoint Name */}
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      Endpoint Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      placeholder="e.g., get_user_data, weather_api"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={isSubmitting}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Use lowercase letters, numbers, and underscores only (no
                      spaces)
                    </p>
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Optional description of what this endpoint does..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={isSubmitting}
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Endpoint Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle>Endpoint Configuration</CardTitle>
                  <CardDescription>
                    Configure the HTTP details of your endpoint
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* URL */}
                  <div className="space-y-2">
                    <Label htmlFor="url">
                      Endpoint URL <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="url"
                      type="url"
                      placeholder="https://api.example.com/v1/users"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      disabled={isSubmitting}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      The full URL of the API endpoint
                    </p>
                  </div>

                  {/* HTTP Method */}
                  <div className="space-y-2">
                    <Label htmlFor="method">
                      HTTP Method <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={method}
                      onValueChange={setMethod}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="method">
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

                  {/* Response Type */}
                  <div className="space-y-2">
                    <Label htmlFor="responseType">Response Type</Label>
                    <Select
                      value={responseType}
                      onValueChange={setResponseType}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="responseType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="json">JSON</SelectItem>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="xml">XML</SelectItem>
                        <SelectItem value="html">HTML</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Headers */}
              <Card>
                <CardHeader>
                  <CardTitle>HTTP Headers (Optional)</CardTitle>
                  <CardDescription>
                    Add custom headers for authentication or other purposes
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {headers.map((header, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <div className="flex-1 space-y-2">
                        <Input
                          placeholder="Header key (e.g., Authorization)"
                          value={header.key}
                          onChange={(e) =>
                            updateHeader(index, "key", e.target.value)
                          }
                          disabled={isSubmitting}
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <Input
                          placeholder="Header value (e.g., Bearer token)"
                          value={header.value}
                          onChange={(e) =>
                            updateHeader(index, "value", e.target.value)
                          }
                          disabled={isSubmitting}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => removeHeader(index)}
                        disabled={headers.length === 1 || isSubmitting}
                      >
                        ×
                      </Button>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={addHeader}
                    disabled={isSubmitting}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Header
                  </Button>
                </CardContent>
              </Card>

              {/* Parameters */}
              <Card>
                <CardHeader>
                  <CardTitle>Request Parameters (Optional)</CardTitle>
                  <CardDescription>
                    Define parameters that can be passed to your endpoint
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {parameters.map((param, index) => (
                    <div
                      key={index}
                      className="space-y-3 p-4 border rounded-lg bg-muted/30"
                    >
                      <div className="flex gap-2 items-start">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          {/* Parameter Name */}
                          <div className="space-y-2">
                            <Label htmlFor={`param-name-${index}`}>Name</Label>
                            <Input
                              id={`param-name-${index}`}
                              placeholder="e.g., userId, page"
                              value={param.name}
                              onChange={(e) =>
                                updateParameter(index, "name", e.target.value)
                              }
                              disabled={isSubmitting}
                            />
                          </div>

                          {/* Parameter Type */}
                          <div className="space-y-2">
                            <Label htmlFor={`param-type-${index}`}>Type</Label>
                            <Select
                              value={param.type}
                              onValueChange={(value) =>
                                updateParameter(index, "type", value)
                              }
                              disabled={isSubmitting}
                            >
                              <SelectTrigger id={`param-type-${index}`}>
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
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => removeParameter(index)}
                          disabled={parameters.length === 1 || isSubmitting}
                          className="mt-8"
                        >
                          ×
                        </Button>
                      </div>

                      {/* Parameter Description */}
                      <div className="space-y-2">
                        <Label htmlFor={`param-desc-${index}`}>
                          Description
                        </Label>
                        <Input
                          id={`param-desc-${index}`}
                          placeholder="Optional description..."
                          value={param.description || ""}
                          onChange={(e) =>
                            updateParameter(
                              index,
                              "description",
                              e.target.value
                            )
                          }
                          disabled={isSubmitting}
                        />
                      </div>

                      {/* Required Checkbox */}
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`param-required-${index}`}
                          checked={param.required}
                          onChange={(e) =>
                            updateParameter(index, "required", e.target.checked)
                          }
                          disabled={isSubmitting}
                          className="rounded border-gray-300"
                        />
                        <Label
                          htmlFor={`param-required-${index}`}
                          className="font-normal cursor-pointer"
                        >
                          Required parameter
                        </Label>
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={addParameter}
                    disabled={isSubmitting}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Parameter
                  </Button>
                </CardContent>
              </Card>

              {/* Submit Buttons */}
              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? (
                    <>Creating...</>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Endpoint
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/dashboard/endpoints/manage")}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
              </div>
            </form>

            {/* Help Section */}
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-base">💡 Tips</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    Use descriptive names in snake_case format (e.g.,
                    get_user_data, fetch_weather)
                  </li>
                  <li>
                    Names must be lowercase with underscores only - no spaces or
                    special characters
                  </li>
                  <li>
                    Ensure the URL is accessible and returns valid responses
                  </li>
                  <li>Add authentication headers if your API requires them</li>
                  <li>
                    You can test your endpoint after creation in the manage
                    section
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ProtectedRoute>
  );
}
