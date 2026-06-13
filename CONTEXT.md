# LLM Hub Plugin

LLM Hub is an Obsidian plugin for chatting with, automating through, and searching across multiple language-model backends. Its core domain is how users configure providers, select models, and use those models across chat, workflows, and search.

## Language

### Provider Configuration

**API Provider**:
A configured remote model backend that can expose one or more selectable models to the plugin.
_Avoid_: endpoint, vendor, connection

**Model**:
A selectable language or image model that the plugin can run through a provider.
_Avoid_: engine, deployment target

**Azure OpenAI Deployment**:
An Azure-hosted model endpoint exposed through the Azure OpenAI-compatible API surface and addressed as a deployment chosen by the user.
_Avoid_: Azure Foundry model, serverless model

**Azure Provider Configuration**:
One API Provider entry representing one Azure resource endpoint, one API key, one API version, and many Azure OpenAI Deployments.
_Avoid_: deployment config, per-model provider

**Azure Resource Endpoint**:
The base HTTPS endpoint for one Azure OpenAI resource, reused by all Azure OpenAI Deployments under that provider configuration.
_Avoid_: base URL, deployment URL

**Azure API Version**:
The explicit Azure OpenAI API version configured on the provider and sent with Azure requests.
_Avoid_: SDK version, plugin version

## Flagged ambiguities

- **Azure Foundry models** was ambiguous. In this repository, unless stated otherwise, it means **Azure OpenAI Deployment** support via Azure's OpenAI-compatible surface, not Azure AI Foundry's separate serverless/models API.

## Example dialogue

**Dev**: Do we need a new kind of provider for this work?
**Domain expert**: Only if Azure can't behave like an existing API Provider. For the first slice, we're treating it as an API Provider that exposes Azure OpenAI Deployments as selectable Models.

**Dev**: So if a user says they want Azure Foundry, what should I assume?
**Domain expert**: Assume they mean Azure OpenAI Deployment support unless they explicitly ask for the separate serverless/models API.

**Dev**: Does one Azure entry represent one deployment?
**Domain expert**: No. One Azure Provider Configuration represents one Azure Resource Endpoint and exposes many Azure OpenAI Deployments as selectable Models.
