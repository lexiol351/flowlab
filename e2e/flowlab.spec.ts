import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end tests for FlowLab. They exercise REAL behavior against the
 * production build: creating workflows, adding/connecting nodes, executing
 * the engine, branching, persistence across reloads, and export/import.
 */

async function resetApp(page: Page): Promise<void> {
  await page.goto('/');
  // Wipe IndexedDB for a deterministic starting state, then reload.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('flowlab-db');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      }),
  );
  await page.reload();
  await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 20_000 });
}

async function loadExample(page: Page, exampleId: string): Promise<void> {
  await page.getByTestId('workflows-button').click();
  const dialog = page.getByTestId('workflows-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId(`load-example-${exampleId}`).click();
  await expect(dialog).toBeHidden();
}

async function runWorkflow(page: Page): Promise<void> {
  await page.getByTestId('execute-button').click();
  // Wait until the run finishes (button re-enables).
  await expect(page.getByTestId('execute-button')).toBeEnabled({ timeout: 15_000 });
}

/** Text shown on the output node card (last received value). */
async function outputNodeText(page: Page): Promise<string[]> {
  const outputs = page
    .getByTestId('flow-node')
    .filter({ has: page.getByTestId('node-output') });
  return outputs.getByTestId('node-output').allTextContents();
}

test.describe('FlowLab', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('application loads with editor chrome', async ({ page }) => {
    await expect(page).toHaveTitle(/FlowLab/);
    await expect(page.getByTestId('flow-canvas')).toBeVisible();
    await expect(page.getByTestId('node-palette')).toBeVisible();
    await expect(page.getByTestId('execute-button')).toBeVisible();
    await expect(page.getByTestId('properties-panel')).toBeVisible();
    await expect(page.getByTestId('execution-log')).toBeVisible();
  });

  test('create a workflow, add nodes, connect them via dialog, execute', async ({
    page,
  }) => {
    // 1. Create a workflow.
    await page.getByTestId('workflows-button').click();
    await page.getByTestId('new-workflow-button').click();
    await expect(page.getByText('Created workflow')).toBeVisible();

    // 2. Add nodes via the palette (click to add).
    await page.locator('[data-testid="palette-item"][data-node-type="textInput"]').click();
    await page.locator('[data-testid="palette-item"][data-node-type="textTransform"]').click();
    await page.locator('[data-testid="palette-item"][data-node-type="output"]').click();
    await expect(page.getByTestId('flow-node')).toHaveCount(3);

    // 3. Connect compatible ports through the connect dialog.
    const nodeIds = await page.getByTestId('flow-node').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-node-id') as string),
    );
    const idOf = async (type: string): Promise<string> =>
      (await page
        .locator(`[data-testid="flow-node"][data-node-type="${type}"]`)
        .getAttribute('data-node-id')) as string;
    const textInputId = await idOf('textInput');
    const transformId = await idOf('textTransform');
    const outputId = await idOf('output');
    expect(new Set(nodeIds).size).toBe(3);

    await page.getByTestId('connect-button').click();
    await page.getByTestId('connect-source-node').selectOption(textInputId);
    await page.getByTestId('connect-source-port').selectOption('value');
    await page.getByTestId('connect-target-node').selectOption(transformId);
    await page.getByTestId('connect-target-port').selectOption('in');
    await expect(page.getByTestId('connect-validation')).toContainText(/ready/i);
    await page.getByTestId('connect-confirm').click();
    await expect(page.getByTestId('connect-dialog')).toBeHidden();

    await page.getByTestId('connect-button').click();
    await page.getByTestId('connect-source-node').selectOption(transformId);
    await page.getByTestId('connect-source-port').selectOption('out');
    await page.getByTestId('connect-target-node').selectOption(outputId);
    await page.getByTestId('connect-target-port').selectOption('in');
    await page.getByTestId('connect-confirm').click();
    await expect(page.getByTestId('connect-dialog')).toBeHidden();

    // 4. Execute and verify the real output value.
    await runWorkflow(page);
    const texts = await outputNodeText(page);
    expect(texts.join(' ')).toContain('HELLO, FLOWLAB!');
  });

  test('modifying the input changes the result', async ({ page }) => {
    await loadExample(page, 'example-greeting-studio');
    await runWorkflow(page);
    let texts = await outputNodeText(page);
    expect(texts.join(' ')).toContain('ADA LOVELACE');

    // Select the name input node and change its value in the properties panel.
    await page.locator('[data-testid="flow-node"][data-node-type="textInput"]').first().click();
    const valueField = page.locator('[data-testid="config-field"][data-field-key="value"]');
    await expect(valueField).toBeVisible();
    const textarea = valueField.getByRole('textbox');
    await textarea.fill('grace hopper');

    await runWorkflow(page);
    texts = await outputNodeText(page);
    expect(texts.join(' ')).toContain('GRACE HOPPER');
    expect(texts.join(' ')).not.toContain('ADA LOVELACE');
  });

  test('conditional branching routes through the correct branch', async ({ page }) => {
    await loadExample(page, 'example-smart-router');
    await runWorkflow(page);

    // The urgent message takes the TRUE branch: priority inbox shows the flagged text.
    let texts = await outputNodeText(page);
    expect(texts.join(' ')).toContain('PRIORITY');
    expect(texts.join(' ')).toContain('urgent: server is down');

    // Change the message so the condition fails → FALSE branch.
    await page.locator('[data-testid="flow-node"][data-node-type="textInput"]').first().click();
    const valueField = page.locator('[data-testid="config-field"][data-field-key="value"]');
    await valueField.getByRole('textbox').fill('just saying hello');

    await runWorkflow(page);
    texts = await outputNodeText(page);
    const joined = texts.join(' ');
    expect(joined).toContain('just saying hello');
    expect(joined).not.toContain('PRIORITY');
  });

  test('numeric workflow calculates the correct result', async ({ page }) => {
    await loadExample(page, 'example-price-calculator');
    await runWorkflow(page);
    const texts = await outputNodeText(page);
    // 19.99 × 3 = 59.97 (the engine computes the IEEE 754 float 59.96999999999999;
    // the UI formats displayed values to two decimals — exact float behavior is
    // covered by the engine unit tests).
    expect(texts.join(' ')).toContain('59.97');
  });

  test('saved workflow survives a page reload', async ({ page }) => {
    await loadExample(page, 'example-greeting-studio');
    await expect(page.getByTestId('flow-node')).toHaveCount(5);
    // Wait for the debounced autosave to flush.
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('flow-node')).toHaveCount(5);
    // And it still executes.
    await runWorkflow(page);
    const texts = await outputNodeText(page);
    expect(texts.join(' ')).toContain('ADA LOVELACE');
  });

  test('export and re-import preserves functionality', async ({ page }) => {
    await loadExample(page, 'example-price-calculator');

    // Export via the workflows dialog.
    await page.getByTestId('workflows-button').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('workflow-item').first().getByTestId('export-workflow-button').click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    // Delete the workflow, then re-import the file.
    await page.getByTestId('workflow-item').first().getByTestId('delete-workflow-button').click();
    await page.getByTestId('confirm-dialog-confirm').click();
    await expect(page.getByTestId('flow-node')).toHaveCount(0);

    const importInput = page.getByTestId('import-input');
    await importInput.setInputFiles(downloadPath as string);
    await expect(page.getByTestId('workflows-dialog')).toBeHidden();
    await expect(page.getByTestId('flow-node')).toHaveCount(4);

    await runWorkflow(page);
    const texts = await outputNodeText(page);
    expect(texts.join(' ')).toContain('59.97');
  });

  test('incompatible connections are rejected', async ({ page }) => {
    await page.locator('[data-testid="palette-item"][data-node-type="numberInput"]').click();
    await page.locator('[data-testid="palette-item"][data-node-type="textTransform"]').click();

    const idOf = async (type: string): Promise<string> =>
      (await page
        .locator(`[data-testid="flow-node"][data-node-type="${type}"]`)
        .getAttribute('data-node-id')) as string;
    const numberId = await idOf('numberInput');
    const textId = await idOf('textTransform');

    await page.getByTestId('connect-button').click();
    await page.getByTestId('connect-source-node').selectOption(numberId);
    await page.getByTestId('connect-source-port').selectOption('value');
    await page.getByTestId('connect-target-node').selectOption(textId);
    await page.getByTestId('connect-target-port').selectOption('in');

    // The dialog must refuse: type mismatch message and disabled confirm.
    await expect(page.getByTestId('connect-validation')).toContainText(/mismatch/i);
    await expect(page.getByTestId('connect-confirm')).toBeDisabled();
  });

  test('undo and redo restore editor state', async ({ page }) => {
    await page.locator('[data-testid="palette-item"][data-node-type="textInput"]').click();
    await expect(page.getByTestId('flow-node')).toHaveCount(1);

    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('flow-node')).toHaveCount(0);

    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(page.getByTestId('flow-node')).toHaveCount(1);
  });

  test('invalid graph cannot run', async ({ page }) => {
    // A transform with no input connected is invalid → Run must refuse.
    await page.locator('[data-testid="palette-item"][data-node-type="textTransform"]').click();
    await expect(page.getByTestId('flow-node')).toHaveCount(1);
    await expect(page.getByTestId('execute-button')).toBeDisabled();
  });
test('template node builds text from placeholders', async ({ page }) => {
  await page.getByTestId('workflows-button').click();
  const dialog = page.getByTestId('workflows-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('load-example-example-mail-merge').click();
  await expect(dialog).toBeHidden();
  await page.getByTestId('execute-button').click();
  await expect(page.getByTestId('node-output')).toContainText([
    'Dear Ada Lovelace, your order #42 has shipped!',
  ]);
});

test('switch routes to exactly one branch', async ({ page }) => {
  await page.getByTestId('workflows-button').click();
  const dialog = page.getByTestId('workflows-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('load-example-example-switchboard').click();
  await expect(dialog).toBeHidden();
  await page.getByTestId('execute-button').click();
  // Input is "b" → the switch routes through case2; the other outputs are skipped.
  const outputs = await page.getByTestId('node-output').allTextContents();
  expect(outputs.join(' ')).toContain('case2: "b"');
  const log = await page.getByTestId('execution-log').textContent();
  expect(log).toContain('2 skipped');
  expect(log).toContain('routed through the "case2" branch');
});

test('copy and paste duplicates nodes', async ({ page }) => {
  await page
    .locator('[data-testid="palette-item"][data-node-type="textInput"]')
    .click();
  await expect(page.getByTestId('flow-node')).toHaveCount(1);
  await page.getByTestId('flow-node').click();
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(page.getByTestId('flow-node')).toHaveCount(2);
});

test('auto-layout arranges nodes in layers', async ({ page }) => {
  await page
    .locator('[data-testid="palette-item"][data-node-type="textInput"]')
    .click();
  await page
    .locator('[data-testid="palette-item"][data-node-type="textTransform"]')
    .click();
  await page
    .locator('[data-testid="palette-item"][data-node-type="output"]')
    .click();
  await expect(page.getByTestId('flow-node')).toHaveCount(3);
  // Connect input → transform → output via the accessible dialog.
  const idOf = async (type: string): Promise<string> =>
    (await page
      .locator(`[data-testid="flow-node"][data-node-type="${type}"]`)
      .getAttribute('data-node-id')) as string;
  const textInputId = await idOf('textInput');
  const transformId = await idOf('textTransform');
  const outputId = await idOf('output');
  await page.getByTestId('connect-button').click();
  await page.getByTestId('connect-source-node').selectOption(textInputId);
  await page.getByTestId('connect-source-port').selectOption('value');
  await page.getByTestId('connect-target-node').selectOption(transformId);
  await page.getByTestId('connect-target-port').selectOption('in');
  await page.getByTestId('connect-confirm').click();
  await expect(page.getByTestId('connect-dialog')).toBeHidden();
  await page.getByTestId('connect-button').click();
  await page.getByTestId('connect-source-node').selectOption(transformId);
  await page.getByTestId('connect-source-port').selectOption('out');
  await page.getByTestId('connect-target-node').selectOption(outputId);
  await page.getByTestId('connect-target-port').selectOption('in');
  await page.getByTestId('connect-confirm').click();
  await expect(page.getByTestId('connect-dialog')).toBeHidden();
  await page.getByTestId('auto-layout-button').click();
  await expect(
    page.getByText('Canvas arranged automatically.'),
  ).toBeVisible();
  // Nodes should form left-to-right layers following the connections.
  const boxes = await page.getByTestId('flow-node').evaluateAll((els) =>
    els.map((el) => ({
      type: el.getAttribute('data-node-type'),
      x: (el as HTMLElement).getBoundingClientRect().x,
    })),
  );
  const input = boxes.find((b) => b.type === 'textInput');
  const middle = boxes.find((b) => b.type === 'textTransform');
  const output = boxes.find((b) => b.type === 'output');
  expect(middle!.x).toBeGreaterThan(input!.x);
  expect(output!.x).toBeGreaterThan(middle!.x);
});

test('command palette adds a node', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await page.getByTestId('command-palette-input').fill('random');
  await page.getByTestId('command-palette-item').first().click();
  await expect(page.getByTestId('command-palette')).toBeHidden();
  await expect(
    page.locator('[data-testid="flow-node"][data-node-type="random"]'),
  ).toHaveCount(1);
});

test('dead-end nodes show a warning but can still run', async ({ page }) => {
  await page
    .locator('[data-testid="palette-item"][data-node-type="textInput"]')
    .click();
  await page
    .locator('[data-testid="palette-item"][data-node-type="textTransform"]')
    .click();
  // Connect them so there are no errors; the transform's output goes nowhere
  // → dead-end warning (non-blocking).
  const textInputId = (await page
    .locator('[data-testid="flow-node"][data-node-type="textInput"]')
    .getAttribute('data-node-id')) as string;
  const transformId = (await page
    .locator('[data-testid="flow-node"][data-node-type="textTransform"]')
    .getAttribute('data-node-id')) as string;
  await page.getByTestId('connect-button').click();
  await page.getByTestId('connect-source-node').selectOption(textInputId);
  await page.getByTestId('connect-source-port').selectOption('value');
  await page.getByTestId('connect-target-node').selectOption(transformId);
  await page.getByTestId('connect-target-port').selectOption('in');
  await page.getByTestId('connect-confirm').click();
  await expect(page.getByTestId('connect-dialog')).toBeHidden();
  await expect(page.getByTestId('validation-warnings')).toBeVisible();
  // Warnings don't block the run button.
  await expect(page.getByTestId('execute-button')).toBeEnabled();
});
});
