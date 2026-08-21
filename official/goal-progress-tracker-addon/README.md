# Goal Progress Tracker Addon

A Wealthfolio addon that helps you visualize your investment progress towards
financial goals using an interactive calendar-style representation.

## Features

- **Goal Integration**: Seamlessly integrates with your existing Wealthfolio
  goals through a searchable dropdown selector
- **Visual Progress Tracking**: Calendar grid visualization where each dot
  represents a milestone towards your goal
- **Real-time Portfolio Sync**: Automatically calculates progress using your
  actual portfolio allocations and current valuations
- **Interactive Tooltips**: Hover or click on dots to see detailed milestone
  information including target amounts and status
- **Configurable Step Size**: Customize how much each calendar dot represents
  (editable when no goal is selected)
- **Privacy Support**: Respects your balance privacy settings to hide sensitive
  financial information
- **Responsive Design**: Optimized layout that works on both desktop and mobile
  devices
- **Empty State Handling**: Graceful handling when no goals exist with helpful
  guidance to create your first goal

## How It Works

1. **Select a Goal**: Choose from your existing Wealthfolio goals using the
   searchable dropdown, or work without a goal for custom tracking
2. **View Real-time Progress**: The addon calculates your current progress
   using:
   - Your actual portfolio holdings and valuations
   - Goal allocations (when a goal is selected)
   - Account balances across all your investment accounts
3. **Interactive Calendar Display**:
   - ✅ **Filled dots** for completed milestones
   - 🟡 **Partially filled dot** showing current progress within the milestone
   - ⚪ **Empty dots** for future milestones
   - 💡 **Tooltips** with detailed information on hover/click
4. **Customize Settings**: Adjust step size to change what each dot represents
   (when no goal is selected)

## Installation

1. Build the addon:

   ```bash
   pnpm build
   ```

2. Package the addon:

   ```bash
   pnpm package
   ```

3. Install in Wealthfolio through the addon settings page

## Development

To work on this addon:

```bash
# Install dependencies
pnpm install

# Rebuild continuously without connecting to Wealthfolio
pnpm dev

# Serve the complete runtime package to Wealthfolio with hot reload
pnpm dev:server

# Build for production
pnpm build

# Create distribution package
pnpm bundle
```

## API Usage

This addon demonstrates how to:

- Use `ctx.api.goals.getAll()` to fetch user's investment goals
- Access portfolio data through multiple hooks (`useHoldings`, `useAccounts`,
  `useLatestValuations`)
- Calculate goal progress using proper allocation logic with
  `useGoalAllocations`
- Create custom React hooks for complex data fetching and processing
- Build interactive UI components with tooltips and searchable dropdowns
- Handle loading states, error states, and empty states gracefully
- Integrate with the Wealthfolio sidebar navigation and routing system
- Use the addon-scoped QueryClient; string-key invalidation and refetch
  operations are mirrored to the host cache

## Permissions Required

- **Goals Access**: To read your investment goals and their target amounts
- **Portfolio Access**: To read current holdings, account balances, and
  calculate investment progress
- **Accounts Access**: To access account information for portfolio calculations

UI integration, query caching, storage, packaged assets, toast notifications,
and logging are baseline capabilities in Wealthfolio 3.7 and do not require
manifest permissions. This addon's published 3.6.2 manifest retains its legacy
UI permission entry for release compatibility.

## Settings

- **Goal Selection**: Choose from your existing investment goals via searchable
  dropdown
- **Step Size**: Amount each calendar dot represents (editable when no goal is
  selected, range: $100+)
- **Target Amount**: Automatically set when a goal is selected, or manually
  configurable for custom tracking

## Features Overview

The addon displays an interactive calendar grid that adapts to your screen size
and goal complexity:

```
⚫⚫⚫🟢⚪⚪⚪⚪
⚪⚪⚪⚪⚪⚪⚪⚪
⚪⚪⚪⚪⚪⚪⚪⚪
```

Where:

- ⚫ = Completed milestone (filled dot)
- 🟢 = Current progress (partially filled dot with percentage)
- ⚪ = Future milestone (empty dot)

## License

MIT License - see the main Wealthfolio project for details.
