# Changelog

All notable changes to the Canvas Structured Items plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-12-06

### 🎉 Initial Release

#### ✨ Features

##### Core Functionality
- **Structured Note Creation**: Create Task and Accomplishment notes with rich metadata
- **Auto-generated IDs**: Sequential ID generation (T001, T002, A001, etc.) with configurable prefixes and padding
- **Template System**: Support for default templates with placeholder replacement
- **Canvas Integration**: Direct creation and management of notes within Obsidian Canvas

##### Canvas Features
- **Create Canvas Items**: Add structured notes to canvas via Command Palette or hotkeys
- **Convert Text Nodes**: Right-click menu to convert existing text nodes to structured file nodes
- **Color Coding**: Automatic color assignment based on effort level
- **Viewport Preservation**: Smooth conversion experience with zoom and pan position maintained
- **Connection Preservation**: All node connections maintained during conversion
- **Visual Updates**: Proper rendering of file nodes with properties visible

##### Note Management
- **Smart Filename Generation**: Snake_case conversion with collision detection
- **Frontmatter Handling**: YAML frontmatter creation, parsing, and merging
- **Auto-delete on Canvas Removal**: Optional deletion of plugin-created notes when removed from canvas
- **Safety Confirmations**: Confirmation dialogs before deleting notes
- **Multi-canvas Support**: Proper handling of notes referenced in multiple canvases

##### Notion Integration
- **Database Auto-creation**: Automatically create Notion databases with proper schema
- **Bidirectional Sync**: Sync notes to Notion on creation or on-demand
- **Property Mapping**: Full mapping of note properties to Notion database properties
- **Sync Status Tracking**: Track Notion page IDs in frontmatter
- **Configurable Sync**: Enable/disable sync, auto-sync, or manual-only options

##### Configuration
- **Flexible Settings**: Comprehensive settings panel for all plugin options
- **Folder Management**: Configure base folder, infer from canvas location
- **Effort Customization**: Configurable effort levels and defaults
- **Template Selection**: Support for template folders with multiple templates
- **ID Customization**: Configure prefixes and zero-padding for IDs

##### Developer Experience
- **TypeScript**: Fully typed codebase with strict TypeScript checking
- **Testing**: Jest test suite with coverage
- **Build System**: Makefile with common development tasks
- **Linting**: ESLint with Prettier integration
- **Hot Reload**: Watch mode for development
- **Deployment**: One-command deployment to vault

#### 🛠️ Technical Implementation

##### Architecture
- **Modular Design**: Separated concerns (UI, utilities, Notion client)
- **File-based Canvas Updates**: Direct JSON manipulation for reliability
- **Viewport State Management**: Capture and restore canvas viewport during updates
- **Event-driven**: Proper event handling for canvas modifications
- **Cache Management**: Node cache for deletion detection

##### Performance
- **Minimal Reload Time**: 10ms canvas close/reopen for type changes
- **Efficient ID Scanning**: On-demand scanning of existing notes
- **Lazy Loading**: Templates loaded only when needed
- **Optimized Updates**: In-place node updates when possible

##### Reliability
- **Race Condition Prevention**: File-based updates with proper sequencing
- **Error Handling**: Comprehensive error catching and user notifications
- **Logging System**: File and console logging for debugging
- **Type Safety**: Full TypeScript coverage

##### User Experience
- **Smooth Transitions**: Brief flicker with preserved viewport
- **Clear Notifications**: Informative notices for all operations
- **Intuitive UI**: Modal dialogs with proper validation
- **Contextual Menus**: Right-click integration where appropriate

#### 📚 Documentation

- Comprehensive README with setup, usage, and configuration
- Getting Started guide for quick onboarding
- Development guide for contributors
- Architecture documentation for technical understanding
- Feature-specific documentation (Canvas nodes, templates, etc.)
- Troubleshooting section with common issues

#### 🧪 Testing

- Unit tests for core utilities (ID generation, frontmatter, canvas manipulation)
- Integration test examples
- Test coverage setup
- Testing checklist for manual validation

#### 🔧 Build & Deploy

- Makefile with common tasks (build, dev, test, lint, format, deploy)
- ESBuild configuration for fast bundling
- TypeScript compilation with strict checking
- Quick-start script for initial setup
- Git integration preparation

#### 🐛 Bug Fixes (During Development)

- Fixed Notion `SelectColor` type compatibility
- Fixed `generateNodeId` export visibility
- Fixed frontmatter parsing return types
- Fixed viewport reset on canvas reload
- Fixed properties not displaying after conversion
- Fixed race conditions with canvas autosave
- Fixed node movability issues
- Fixed connection preservation during conversion
- Fixed empty frontmatter field handling

#### 🎨 UI/UX Improvements

- Color-coded canvas nodes by effort
- Smooth viewport preservation during operations
- Proper menu styling for context menus
- Clear success/error notifications
- Intuitive modal dialogs

### 📦 Dependencies

- `obsidian`: ^1.4.0 (peer dependency)
- `@notionhq/client`: ^2.2.13
- `typescript`: ^5.0.0
- `esbuild`: ^0.17.0
- `jest`: ^29.0.0
- `eslint`: ^8.0.0
- `prettier`: ^3.0.0

### 🔒 Security

- No sensitive data stored in plugin code
- Notion tokens stored in plugin settings (user-managed)
- Safe file operations with validation
- Confirmation dialogs for destructive operations

---

## [Unreleased]

### Planned Features
- Multiple template support per type
- Custom property fields
- Batch operations
- Export/import functionality
- Advanced filtering and search
- Status workflow automation
- Time tracking integration

---

**Note**: This is the initial release. Future updates will follow semantic versioning and maintain backward compatibility where possible.

