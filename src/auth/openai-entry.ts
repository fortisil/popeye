/**
 * OpenAI API key entry HTML page
 * Served by the local auth server for browser-based token entry
 */

/**
 * Generate the HTML for the OpenAI token entry page
 */
export function getOpenAIEntryHTML(_port: number): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenAI API Key - Popeye CLI</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }

    .container {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(20px);
      border-radius: 20px;
      padding: 40px;
      max-width: 500px;
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
    }

    .logo {
      text-align: center;
      margin-bottom: 30px;
    }

    .logo-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }

    h1 {
      color: #ffffff;
      font-size: 24px;
      font-weight: 600;
      text-align: center;
      margin-bottom: 10px;
    }

    .subtitle {
      color: rgba(255, 255, 255, 0.7);
      text-align: center;
      margin-bottom: 30px;
      font-size: 14px;
      line-height: 1.5;
    }

    .instructions {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 25px;
    }

    .instructions h3 {
      color: #10b981;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .instructions ol {
      color: rgba(255, 255, 255, 0.8);
      font-size: 14px;
      padding-left: 20px;
      line-height: 1.8;
    }

    .instructions a {
      color: #60a5fa;
      text-decoration: none;
    }

    .instructions a:hover {
      text-decoration: underline;
    }

    .input-group {
      margin-bottom: 20px;
    }

    .input-group label {
      display: block;
      color: rgba(255, 255, 255, 0.9);
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 8px;
    }

    .input-wrapper {
      position: relative;
    }

    input[type="password"],
    input[type="text"] {
      width: 100%;
      padding: 14px 16px;
      padding-right: 45px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 10px;
      color: #ffffff;
      font-size: 14px;
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      transition: all 0.2s ease;
    }

    input:focus {
      outline: none;
      border-color: #10b981;
      background: rgba(255, 255, 255, 0.1);
    }

    input::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }

    .toggle-visibility {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      padding: 5px;
      font-size: 18px;
    }

    .toggle-visibility:hover {
      color: rgba(255, 255, 255, 0.8);
    }

    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 25px;
    }

    .checkbox-group input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: #10b981;
    }

    .checkbox-group label {
      color: rgba(255, 255, 255, 0.8);
      font-size: 14px;
    }

    .button-group {
      display: flex;
      gap: 12px;
    }

    button {
      flex: 1;
      padding: 14px 24px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      border: none;
    }

    .btn-primary {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(16, 185, 129, 0.3);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.15);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    .btn-link {
      background: none;
      color: #60a5fa;
      text-decoration: none;
      padding: 0;
      flex: none;
      width: auto;
    }

    .btn-link:hover {
      text-decoration: underline;
    }

    .error-message {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 10px;
      padding: 12px 16px;
      color: #fca5a5;
      font-size: 14px;
      margin-bottom: 20px;
      display: none;
    }

    .success-message {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 10px;
      padding: 12px 16px;
      color: #6ee7b7;
      font-size: 14px;
      margin-bottom: 20px;
      display: none;
    }

    .footer {
      text-align: center;
      margin-top: 25px;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .footer a {
      color: #60a5fa;
      text-decoration: none;
      font-size: 13px;
    }

    .footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <div class="logo-icon">&#127871;</div>
      <h1>OpenAI API Key Required</h1>
    </div>

    <p class="subtitle">
      Popeye CLI needs an OpenAI API key for consensus reviews.<br>
      Your key will be stored securely in your system keychain.
    </p>

    <div class="instructions">
      <h3>&#9989; How to get your API key:</h3>
      <ol>
        <li>Visit <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com/api-keys</a></li>
        <li>Click "Create new secret key"</li>
        <li>Copy the key and paste it below</li>
      </ol>
    </div>

    <div class="error-message" id="error"></div>
    <div class="success-message" id="success"></div>

    <form id="tokenForm" onsubmit="submitToken(event)">
      <div class="input-group">
        <label for="token">API Key</label>
        <div class="input-wrapper">
          <input
            type="password"
            id="token"
            name="token"
            placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            required
            autocomplete="off"
          />
          <button type="button" class="toggle-visibility" onclick="toggleVisibility()">
            &#128065;
          </button>
        </div>
      </div>

      <div class="checkbox-group">
        <input type="checkbox" id="saveToKeychain" checked />
        <label for="saveToKeychain">Save to system keychain (recommended)</label>
      </div>

      <div class="button-group">
        <button type="button" class="btn-secondary" onclick="openOpenAI()">
          Open OpenAI
        </button>
        <button type="button" class="btn-secondary" onclick="cancel()">
          Cancel
        </button>
        <button type="submit" class="btn-primary" id="submitBtn">
          Authenticate
        </button>
      </div>
    </form>

    <div class="footer">
      <a href="https://platform.openai.com/docs/api-reference" target="_blank">
        OpenAI API Documentation
      </a>
    </div>
  </div>

  <script>
    const tokenInput = document.getElementById('token');
    const errorDiv = document.getElementById('error');
    const successDiv = document.getElementById('success');
    const submitBtn = document.getElementById('submitBtn');

    function toggleVisibility() {
      const input = document.getElementById('token');
      input.type = input.type === 'password' ? 'text' : 'password';
    }

    function openOpenAI() {
      window.open('https://platform.openai.com/api-keys', '_blank');
    }

    function cancel() {
      window.location.href = '/cancel';
    }

    function showError(message) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
      successDiv.style.display = 'none';
    }

    function showSuccess(message) {
      successDiv.textContent = message;
      successDiv.style.display = 'block';
      errorDiv.style.display = 'none';
    }

    function validateToken(token) {
      if (!token) {
        return 'Please enter your API key';
      }
      if (!token.startsWith('sk-')) {
        return 'API key should start with "sk-"';
      }
      if (token.length < 20) {
        return 'API key seems too short';
      }
      return null;
    }

    async function submitToken(event) {
      event.preventDefault();

      const token = tokenInput.value.trim();
      const validationError = validateToken(token);

      if (validationError) {
        showError(validationError);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Validating...';

      // Submit the token
      window.location.href = '/submit?token=' + encodeURIComponent(token);
    }

    // Focus the input on load
    tokenInput.focus();
  </script>
</body>
</html>
`;
}
