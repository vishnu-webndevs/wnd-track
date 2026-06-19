const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'Settings.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Find the parts
const profileStart = content.indexOf('<div className="bg-white shadow rounded-lg p-6">\n        <h2 className="text-lg font-semibold text-gray-900 mb-4">My Profile</h2>');
const profileEnd = content.indexOf('</div>\n\n      <div className="bg-white shadow rounded-lg p-6">\n        <h2 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h2>') + '</div>'.length;

const profileSection = content.substring(profileStart, profileEnd);

const passwordStart = content.indexOf('<div className="bg-white shadow rounded-lg p-6">\n        <h2 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h2>');
const passwordEnd = content.indexOf('</form>\n      </div>') + '</form>\n      </div>'.length;

const passwordSection = content.substring(passwordStart, passwordEnd);

const telegramStart = content.indexOf('{/* Telegram Notification Settings */}');
const telegramEnd = content.indexOf('</div>\n        </div>\n      )}') + '</div>\n        </div>\n      )}'.length;

const telegramSection = content.substring(telegramStart, telegramEnd);

const sessionStart = content.indexOf('<SessionManagement />');
const sessionEnd = sessionStart + '<SessionManagement />'.length;

const sessionSection = content.substring(sessionStart, sessionEnd);

const returnStart = content.indexOf('return (\n    <div className="space-y-6">');
const returnEnd = content.indexOf('  );\n}\n');

const newReturn = `return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Navigation */}
        <div className="w-full md:w-64 flex flex-col space-y-2">
          <button
            onClick={() => setActiveTab('profile')}
            className={\`flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-200 \${
              activeTab === 'profile'
                ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }\`}
          >
            <User className="w-5 h-5" />
            Profile
          </button>
          
          <button
            onClick={() => setActiveTab('security')}
            className={\`flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-200 \${
              activeTab === 'security'
                ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }\`}
          >
            <Shield className="w-5 h-5" />
            Security
          </button>

          {user?.role === 'admin' && (
            <button
              onClick={() => setActiveTab('system')}
              className={\`flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-200 \${
                activeTab === 'system'
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }\`}
            >
              <SettingsIcon className="w-5 h-5" />
              System Preferences
            </button>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 space-y-6">
          {activeTab === 'profile' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              ${profileSection.split('\n').join('\n              ')}
            </div>
          )}

          {activeTab === 'security' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
              ${passwordSection.split('\n').join('\n              ')}
              ${sessionSection}
            </div>
          )}

          {activeTab === 'system' && user?.role === 'admin' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              ${telegramSection.split('\n').join('\n              ')}
            </div>
          )}
        </div>
      </div>
    </div>
  `;

content = content.substring(0, returnStart) + newReturn + content.substring(returnEnd);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done refactoring Settings.tsx');
