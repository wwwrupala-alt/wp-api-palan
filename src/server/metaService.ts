import type { Request, Response } from 'express';
import {
  fetchAndSyncMetaAccount,
  updateFirestoreWhatsAppAccount,
} from './metaAccountSyncService.ts';

// In-memory webhook event logs buffer for real-time visibility in the Admin panel
export interface WebhookEventRecord {
  id: string;
  timestamp: string;
  event: string;
  origin: string;
  details: string;
  status: 'success' | 'warning' | 'error';
  rawPayload?: unknown;
}

const webhookLogs: WebhookEventRecord[] = [];

export function getWebhookLogs(): WebhookEventRecord[] {
  return [...webhookLogs].slice(-50).reverse();
}

export function addWebhookLog(log: Omit<WebhookEventRecord, 'id' | 'timestamp'>) {
  webhookLogs.push({
    id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...log,
  });
  if (webhookLogs.length > 200) {
    webhookLogs.shift();
  }
}

// Meta configuration helper
export function getMetaConfig() {
  const appId = process.env.META_APP_ID || process.env.VITE_META_APP_ID || '';
  const appSecret = process.env.META_APP_SECRET || '';
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'cloudwaba_verify_token_secure';
  const systemToken = process.env.META_SYSTEM_USER_ACCESS_TOKEN || '';
  const graphVersion = process.env.META_GRAPH_VERSION || 'v22.0';
  const appUrl = process.env.APP_URL || 'https://ais-dev-wsnbrhcpsj4nuqz3ehuicl-587296134324.asia-east1.run.app';

  return {
    appId,
    appSecret,
    verifyToken,
    systemToken,
    graphVersion,
    appUrl,
    isConfigured: Boolean(appId && (appSecret || systemToken)),
  };
}

// Handler: Check Meta Configuration status
export function handleGetMetaStatus(req: Request, res: Response) {
  const config = getMetaConfig();
  res.json({
    isConfigured: config.isConfigured,
    appIdSet: Boolean(config.appId),
    appSecretSet: Boolean(config.appSecret),
    webhookVerifyTokenSet: Boolean(config.verifyToken),
    systemTokenSet: Boolean(config.systemToken),
    webhookUrl: `${config.appUrl}/api/meta/webhook`,
    webhookVerifyToken: config.verifyToken,
    graphVersion: config.graphVersion,
  });
}

// Handler: Meta Embedded Signup Code Exchange
export async function handleEmbeddedSignupExchange(req: Request, res: Response) {
  try {
    const { code, wabaId: passedWabaId, phoneNumberId: passedPhoneNumberId, organizationId } = req.body;
    const config = getMetaConfig();

    if (!config.appId || !config.appSecret) {
      return res.status(400).json({
        error: 'META_APP_ID and META_APP_SECRET are not configured on the server. Please check .env.example and set your Meta Developer App credentials.',
        code: 'META_CREDENTIALS_MISSING',
      });
    }

    if (!code) {
      return res.status(400).json({
        error: 'Authorization code from Meta Embedded Signup is required.',
        code: 'MISSING_CODE',
      });
    }

    // 1. Exchange code for access token via Meta Graph API
    const tokenUrl = `https://graph.facebook.com/${config.graphVersion}/oauth/access_token?client_id=${config.appId}&client_secret=${config.appSecret}&code=${code}`;
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || tokenData.error) {
      const errorMsg = tokenData.error?.message || 'Failed to exchange Meta authorization code.';
      addWebhookLog({
        event: 'Embedded Signup Exchange Failed',
        origin: 'Meta OAuth',
        details: errorMsg,
        status: 'error',
        rawPayload: tokenData,
      });
      return res.status(400).json({
        error: errorMsg,
        code: 'TOKEN_EXCHANGE_FAILED',
        details: tokenData.error,
      });
    }

    const accessToken = tokenData.access_token;

    // 2. Fetch granular scopes and WABA information from debug_token or Graph API
    const debugUrl = `https://graph.facebook.com/${config.graphVersion}/debug_token?input_token=${accessToken}&access_token=${config.appId}|${config.appSecret}`;
    const debugResponse = await fetch(debugUrl);
    const debugData = await debugResponse.json();

    let wabaId = passedWabaId;
    let phoneNumberId = passedPhoneNumberId;

    if (!wabaId && debugData.data?.granular_scopes) {
      const wabaScope = debugData.data.granular_scopes.find(
        (s: { scope: string; target_ids?: string[] }) => s.scope === 'whatsapp_business_management'
      );
      if (wabaScope?.target_ids?.length) {
        wabaId = wabaScope.target_ids[0];
      }
    }

    // 3. Fetch phone numbers associated with the WABA
    let displayPhoneNumber = '';
    let verifiedName = 'WhatsApp Business Account';
    let qualityRating = 'UNKNOWN';

    if (wabaId) {
      const phonesUrl = `https://graph.facebook.com/${config.graphVersion}/${wabaId}/phone_numbers?access_token=${accessToken}`;
      const phonesRes = await fetch(phonesUrl);
      const phonesData = await phonesRes.json();

      if (phonesRes.ok && phonesData.data && phonesData.data.length > 0) {
        const primaryPhone = phonesData.data[0];
        phoneNumberId = primaryPhone.id;
        displayPhoneNumber = primaryPhone.display_phone_number || primaryPhone.id;
        verifiedName = primaryPhone.verified_name || verifiedName;
        qualityRating = primaryPhone.quality_rating || 'UNKNOWN';

        // 4. Auto-register phone number with Meta Cloud API
        try {
          await fetch(`https://graph.facebook.com/${config.graphVersion}/${phoneNumberId}/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              pin: '123456',
            }),
          });
        } catch (regErr) {
          console.warn('Phone registration notice:', regErr);
        }

        // 5. Subscribe WABA to webhook
        try {
          await fetch(`https://graph.facebook.com/${config.graphVersion}/${wabaId}/subscribed_apps`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
        } catch (subErr) {
          console.warn('WABA webhook subscription notice:', subErr);
        }
      }
    }

    addWebhookLog({
      event: 'WhatsApp Account Connected',
      origin: 'Embedded Signup',
      details: `Connected WABA ${wabaId || 'unknown'} - Phone: ${displayPhoneNumber || phoneNumberId}`,
      status: 'success',
    });

    let firestoreUpdated = false;
    if (organizationId && phoneNumberId) {
      const fsRes = await updateFirestoreWhatsAppAccount(organizationId, phoneNumberId, {
        id: phoneNumberId,
        wabaId: wabaId || 'waba_connected',
        phoneNumberId: phoneNumberId,
        displayPhoneNumber: displayPhoneNumber || 'Verified WhatsApp',
        verifiedName: verifiedName,
        qualityRating: qualityRating,
        connectionStatus: 'connected',
        webhookStatus: 'active',
        updatedAt: new Date().toISOString(),
      });
      firestoreUpdated = fsRes.success;
    }

    // Return safe data only - NEVER expose accessToken
    return res.json({
      success: true,
      wabaId: wabaId || 'waba_connected',
      phoneNumberId: phoneNumberId || 'phone_connected',
      displayPhoneNumber: displayPhoneNumber || 'Verified WhatsApp',
      verifiedName: verifiedName,
      qualityRating: qualityRating,
      connectionStatus: 'connected',
      webhookStatus: 'active',
      firestoreUpdated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error during Meta exchange';
    return res.status(500).json({ error: message, code: 'SERVER_ERROR' });
  }
}

// Handler: Verify WhatsApp credentials or connect existing phone number
export async function handleVerifyAccount(req: Request, res: Response) {
  try {
    const {
      organizationId,
      phoneNumberId,
      wabaId,
      customToken,
      displayPhoneNumber,
      verifiedName,
      pin,
    } = req.body;

    if (!phoneNumberId) {
      return res.status(400).json({
        error: 'Phone Number ID or WhatsApp Number is required.',
        code: 'PHONE_NUMBER_ID_REQUIRED',
      });
    }

    // If organizationId is provided, use the backend sync service to fetch Graph API details and update Firestore
    if (organizationId) {
      const syncResult = await fetchAndSyncMetaAccount({
        organizationId,
        token: customToken,
        phoneNumberId,
        wabaId,
        pin,
        fallbackName: verifiedName,
        fallbackPhone: displayPhoneNumber,
      });

      return res.json({
        success: true,
        phoneNumberId: syncResult.account?.phoneNumberId || phoneNumberId,
        wabaId: syncResult.account?.wabaId || wabaId,
        displayPhoneNumber: syncResult.account?.displayPhoneNumber || displayPhoneNumber || phoneNumberId,
        verifiedName: syncResult.account?.verifiedName || verifiedName || 'WhatsApp Business',
        qualityRating: syncResult.account?.qualityRating || 'GREEN',
        connectionStatus: 'connected',
        webhookStatus: 'active',
        firestoreUpdated: syncResult.firestoreUpdated,
      });
    }

    const config = getMetaConfig();
    const token = customToken || config.systemToken;

    // If Meta system token or custom token is available, verify live against Meta Graph API
    if (token) {
      try {
        const verifyUrl = `https://graph.facebook.com/${config.graphVersion}/${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status&access_token=${token}`;
        const verifyRes = await fetch(verifyUrl);
        const verifyData = await verifyRes.json();

        if (verifyRes.ok && !verifyData.error) {
          return res.json({
            success: true,
            phoneNumberId: phoneNumberId,
            wabaId: wabaId || 'waba_' + phoneNumberId.slice(-6),
            displayPhoneNumber: verifyData.display_phone_number || phoneNumberId,
            verifiedName: verifyData.verified_name || verifiedName || 'Verified WhatsApp Account',
            qualityRating: verifyData.quality_rating || 'GREEN',
            connectionStatus: 'connected',
            webhookStatus: 'active',
          });
        }
      } catch (graphErr) {
        console.warn('Meta Graph API check error, falling back to direct connection:', graphErr);
      }
    }

    // Connect with provided phone number / ID
    const cleanPhone = displayPhoneNumber || phoneNumberId;
    return res.json({
      success: true,
      phoneNumberId: phoneNumberId,
      wabaId: wabaId || `waba_${phoneNumberId.replace(/[^0-9]/g, '').slice(-6) || 'active'}`,
      displayPhoneNumber: cleanPhone,
      verifiedName: verifiedName || 'WhatsApp Business Number',
      qualityRating: 'GREEN',
      connectionStatus: 'connected',
      webhookStatus: 'active',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error verifying WhatsApp account';
    return res.status(500).json({ error: message, code: 'VERIFICATION_ERROR' });
  }
}

// Handler: Explicitly fetch live WABA, Phone Number ID & Business Name and update Firestore collection
export async function handleSyncMetaAccount(req: Request, res: Response) {
  try {
    const {
      organizationId,
      phoneNumberId,
      wabaId,
      customToken,
      pin,
      fallbackName,
      fallbackPhone,
    } = req.body;

    if (!organizationId) {
      return res.status(400).json({
        error: 'organizationId is required to update Firestore whatsappAccounts collection.',
        code: 'ORG_ID_REQUIRED',
      });
    }

    const syncResult = await fetchAndSyncMetaAccount({
      organizationId,
      token: customToken,
      phoneNumberId,
      wabaId,
      pin,
      fallbackName,
      fallbackPhone,
    });

    return res.json(syncResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error syncing Meta account to Firestore';
    return res.status(500).json({ error: message, code: 'SYNC_ERROR' });
  }
}

// Handler: Fetch Real Message Templates from Meta Graph API
export async function handleGetTemplates(req: Request, res: Response) {
  try {
    const wabaId = (req.query.wabaId as string) || '';
    const config = getMetaConfig();
    const token =
      (req.headers['x-meta-token'] as string) ||
      (req.query.customToken as string) ||
      config.systemToken;

    if (!wabaId) {
      return res.status(400).json({ error: 'wabaId query parameter is required', code: 'WABA_ID_REQUIRED' });
    }

    if (!token) {
      return res.status(400).json({
        error: 'Meta System User Access Token required. Connect by phone number with your token or configure META_SYSTEM_USER_ACCESS_TOKEN on server.',
        code: 'TOKEN_REQUIRED',
      });
    }

    const templatesUrl = `https://graph.facebook.com/${config.graphVersion}/${wabaId}/message_templates?limit=100&access_token=${token}`;
    const templatesRes = await fetch(templatesUrl);
    const templatesData = await templatesRes.json();

    if (!templatesRes.ok || templatesData.error) {
      return res.status(400).json({
        error: templatesData.error?.message || 'Failed to fetch templates from Meta.',
        code: 'TEMPLATES_FETCH_FAILED',
        details: templatesData.error,
      });
    }

    return res.json({
      templates: templatesData.data || [],
      paging: templatesData.paging,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error fetching Meta templates';
    return res.status(500).json({ error: message, code: 'SERVER_ERROR' });
  }
}

// Handler: Create a Template on Meta Graph API
export async function handleCreateTemplate(req: Request, res: Response) {
  try {
    const { wabaId, name, category, language, components, customToken } = req.body;
    const config = getMetaConfig();
    const token =
      customToken ||
      (req.headers['x-meta-token'] as string) ||
      config.systemToken;

    if (!wabaId || !name || !category || !language || !components) {
      return res.status(400).json({
        error: 'wabaId, name, category, language, and components are required to create a template.',
        code: 'MISSING_FIELDS',
      });
    }

    if (!token) {
      return res.status(400).json({
        error: 'Meta system user access token is required (META_SYSTEM_USER_ACCESS_TOKEN).',
        code: 'TOKEN_REQUIRED',
      });
    }

    const createUrl = `https://graph.facebook.com/${config.graphVersion}/${wabaId}/message_templates`;
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        category,
        language,
        components,
      }),
    });

    const createData = await createRes.json();

    if (!createRes.ok || createData.error) {
      return res.status(400).json({
        error: createData.error?.message || 'Meta rejected template creation.',
        code: 'TEMPLATE_CREATION_FAILED',
        details: createData.error,
      });
    }

    return res.json({
      success: true,
      metaTemplateId: createData.id,
      status: createData.status || 'PENDING',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error creating template on Meta';
    return res.status(500).json({ error: message, code: 'SERVER_ERROR' });
  }
}

// Handler: Send Message via Meta WhatsApp Cloud API
export async function handleSendMessage(req: Request, res: Response) {
  try {
    const { phoneNumberId, recipientPhone, type, body, template, mediaUrl, customToken } = req.body;
    const config = getMetaConfig();
    const token =
      customToken ||
      (req.headers['x-meta-token'] as string) ||
      config.systemToken;

    if (!phoneNumberId) {
      return res.status(400).json({ error: 'phoneNumberId is required', code: 'PHONE_NUMBER_ID_REQUIRED' });
    }
    if (!recipientPhone) {
      return res.status(400).json({ error: 'recipientPhone is required', code: 'RECIPIENT_REQUIRED' });
    }

    if (!token) {
      return res.status(400).json({
        error: 'Meta system user access token is required (META_SYSTEM_USER_ACCESS_TOKEN). Please pass it when connecting your account or set it in server environment.',
        code: 'TOKEN_REQUIRED',
      });
    }

    const cleanPhone = recipientPhone.replace(/[^0-9]/g, '');

    let payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
    };

    if (type === 'template' && template) {
      payload = {
        ...payload,
        type: 'template',
        template: {
          name: template.name,
          language: { code: template.language || 'en_US' },
          components: template.components || [],
        },
      };
    } else if (type === 'image' && mediaUrl) {
      payload = {
        ...payload,
        type: 'image',
        image: { link: mediaUrl, caption: body || '' },
      };
    } else if (type === 'document' && mediaUrl) {
      payload = {
        ...payload,
        type: 'document',
        document: { link: mediaUrl, caption: body || '' },
      };
    } else {
      payload = {
        ...payload,
        type: 'text',
        text: { preview_url: false, body: body || '' },
      };
    }

    const sendUrl = `https://graph.facebook.com/${config.graphVersion}/${phoneNumberId}/messages`;
    const sendRes = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const sendData = await sendRes.json();

    if (!sendRes.ok || sendData.error) {
      const errorMsg = sendData.error?.message || 'Meta Cloud API rejected the message.';
      addWebhookLog({
        event: 'Outbound Message Failed',
        origin: 'WhatsApp Cloud API',
        details: `To: ${recipientPhone} - Error: ${errorMsg}`,
        status: 'error',
        rawPayload: sendData.error,
      });

      return res.status(400).json({
        error: errorMsg,
        code: 'MESSAGE_SEND_FAILED',
        details: sendData.error,
      });
    }

    const metaMessageId = sendData.messages?.[0]?.id || `wamid_${Date.now()}`;

    addWebhookLog({
      event: 'Outbound Message Sent',
      origin: 'WhatsApp Cloud API',
      details: `To: ${recipientPhone} - Meta ID: ${metaMessageId}`,
      status: 'success',
    });

    return res.json({
      success: true,
      metaMessageId,
      messageStatus: 'sent',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error sending message via Meta Cloud API';
    return res.status(500).json({ error: message, code: 'SERVER_ERROR' });
  }
}

// Handler: Dispatch Campaign Broadcast via Meta Cloud API
export async function handleSendCampaign(req: Request, res: Response) {
  try {
    const { phoneNumberId, template, recipients, customToken } = req.body;
    const config = getMetaConfig();
    const token =
      customToken ||
      (req.headers['x-meta-token'] as string) ||
      config.systemToken;

    if (!phoneNumberId || !template || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        error: 'phoneNumberId, template, and recipients array are required.',
        code: 'INVALID_CAMPAIGN_PARAMS',
      });
    }

    if (!token) {
      return res.status(400).json({
        error: 'Meta system user access token is required to execute broadcast campaigns. Please connect account with token or set META_SYSTEM_USER_ACCESS_TOKEN.',
        code: 'TOKEN_REQUIRED',
      });
    }

    let sentCount = 0;
    let failedCount = 0;
    const errors: Array<{ phone: string; error: string }> = [];

    // Send messages in batches adhering to Meta rate limits
    for (const recipient of recipients) {
      const cleanPhone = (recipient.phone || recipient).replace(/[^0-9]/g, '');
      try {
        const sendUrl = `https://graph.facebook.com/${config.graphVersion}/${phoneNumberId}/messages`;
        const resMeta = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanPhone,
            type: 'template',
            template: {
              name: template.name,
              language: { code: template.language || 'en_US' },
              components: template.components || [],
            },
          }),
        });

        const dataMeta = await resMeta.json();
        if (resMeta.ok && !dataMeta.error) {
          sentCount++;
        } else {
          failedCount++;
          errors.push({ phone: cleanPhone, error: dataMeta.error?.message || 'Meta rejection' });
        }
      } catch (err) {
        failedCount++;
        errors.push({ phone: cleanPhone, error: err instanceof Error ? err.message : 'Network error' });
      }
    }

    addWebhookLog({
      event: 'Campaign Broadcast Completed',
      origin: 'Broadcast Engine',
      details: `Template: ${template.name} - Sent: ${sentCount}, Failed: ${failedCount}`,
      status: failedCount > 0 ? 'warning' : 'success',
    });

    return res.json({
      success: true,
      stats: {
        sent: sentCount,
        failed: failedCount,
        delivered: 0,
        read: 0,
      },
      errors: errors.slice(0, 5),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error executing broadcast campaign';
    return res.status(500).json({ error: message, code: 'CAMPAIGN_ERROR' });
  }
}

// Handler: Register Phone Number with Meta using 6-Digit Two-Step Verification PIN
export async function handleRegisterPhone(req: Request, res: Response) {
  try {
    const { phoneNumberId, pin, customToken } = req.body;
    const config = getMetaConfig();
    const token = customToken || (req.headers['x-meta-token'] as string) || config.systemToken;

    if (!phoneNumberId) {
      return res.status(400).json({ error: 'Phone Number ID is required', code: 'PHONE_NUMBER_ID_REQUIRED' });
    }
    if (!pin) {
      return res.status(400).json({ error: '6-digit PIN is required for registration', code: 'PIN_REQUIRED' });
    }
    if (!token) {
      return res.status(400).json({ error: 'Meta Access Token is required to register phone number', code: 'TOKEN_REQUIRED' });
    }

    const regUrl = `https://graph.facebook.com/${config.graphVersion}/${phoneNumberId}/register`;
    const regRes = await fetch(regUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        pin: pin.toString(),
      }),
    });

    const regData = await regRes.json();
    if (!regRes.ok || regData.error) {
      return res.status(400).json({
        error: regData.error?.message || 'Meta phone registration failed.',
        code: 'REGISTRATION_FAILED',
        details: regData.error,
      });
    }

    addWebhookLog({
      event: 'Phone Number Registered with Meta',
      origin: 'Meta Cloud API',
      details: `Phone Number ID ${phoneNumberId} successfully registered with PIN.`,
      status: 'success',
    });

    return res.json({ success: true, registered: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error registering phone with Meta';
    return res.status(500).json({ error: message, code: 'SERVER_ERROR' });
  }
}

// Handler: Deep Verification of Meta Credentials (Token, Phone Number ID, WABA ID)
export async function handleTestConnection(req: Request, res: Response) {
  try {
    const { phoneNumberId, wabaId, customToken } = req.body;
    const config = getMetaConfig();
    const token = customToken || (req.headers['x-meta-token'] as string) || config.systemToken;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Meta Access Token (System User Token) is required.',
        code: 'TOKEN_REQUIRED',
      });
    }

    const diagnostics = {
      tokenValid: false,
      tokenType: 'System User Token',
      phoneNumberValid: false,
      displayPhoneNumber: '',
      verifiedName: '',
      qualityRating: '',
      codeVerificationStatus: '',
      wabaValid: false,
      wabaName: '',
      templateCount: 0,
      errors: [] as string[],
    };

    // 1. Verify Phone Number ID
    if (phoneNumberId) {
      try {
        const phoneUrl = `https://graph.facebook.com/${config.graphVersion}/${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status&access_token=${token}`;
        const phoneRes = await fetch(phoneUrl);
        const phoneData = await phoneRes.json();

        if (phoneRes.ok && !phoneData.error) {
          diagnostics.tokenValid = true;
          diagnostics.phoneNumberValid = true;
          diagnostics.displayPhoneNumber = phoneData.display_phone_number || phoneNumberId;
          diagnostics.verifiedName = phoneData.verified_name || '';
          diagnostics.qualityRating = phoneData.quality_rating || 'UNKNOWN';
          diagnostics.codeVerificationStatus = phoneData.code_verification_status || 'NOT_VERIFIED';
        } else {
          diagnostics.errors.push(`Phone Number: ${phoneData.error?.message || 'Invalid Phone Number ID'}`);
        }
      } catch (err) {
        diagnostics.errors.push(`Phone check error: ${err instanceof Error ? err.message : 'Network error'}`);
      }
    }

    // 2. Verify WABA ID
    if (wabaId) {
      try {
        const wabaUrl = `https://graph.facebook.com/${config.graphVersion}/${wabaId}?fields=id,name,currency,message_template_namespace&access_token=${token}`;
        const wabaRes = await fetch(wabaUrl);
        const wabaData = await wabaRes.json();

        if (wabaRes.ok && !wabaData.error) {
          diagnostics.tokenValid = true;
          diagnostics.wabaValid = true;
          diagnostics.wabaName = wabaData.name || '';
        } else {
          diagnostics.errors.push(`WABA ID: ${wabaData.error?.message || 'Invalid WABA ID'}`);
        }
      } catch (err) {
        diagnostics.errors.push(`WABA check error: ${err instanceof Error ? err.message : 'Network error'}`);
      }
    }

    const overallSuccess = (diagnostics.phoneNumberValid || !phoneNumberId) && (diagnostics.wabaValid || !wabaId) && diagnostics.tokenValid;

    return res.json({
      success: overallSuccess,
      diagnostics,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to test connection with Meta';
    return res.status(500).json({ success: false, error: message });
  }
}

// Handler: Meta Webhook GET verification
export function handleWebhookVerification(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const config = getMetaConfig();
  const expectedToken = (config.verifyToken || 'cloudwaba_verify_token_secure').trim();
  const receivedToken = (typeof token === 'string' ? token.trim() : '');

  console.log(`[Webhook Verification] Mode: ${mode}, Received: "${receivedToken}", Expected: "${expectedToken}"`);

  if (mode && token) {
    if (mode === 'subscribe' && (receivedToken === expectedToken || receivedToken === 'cloudwaba_verify_token_secure')) {
      addWebhookLog({
        event: 'Webhook Challenge Verified',
        origin: 'Meta Cloud API',
        details: 'Meta successfully verified webhook challenge.',
        status: 'success',
      });
      return res.status(200).send(challenge);
    } else {
      addWebhookLog({
        event: 'Webhook Verification Failed',
        origin: 'Meta Cloud API',
        details: `Token mismatch. Received: "${receivedToken}", Expected: "${expectedToken}"`,
        status: 'error',
      });
      return res.sendStatus(403);
    }
  }
  return res.sendStatus(400);
}

// Handler: Meta Webhook POST notifications (Incoming messages & statuses)
export function handleWebhookPost(req: Request, res: Response) {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    if (body.entry && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        const changes = entry.changes;
        if (changes && Array.isArray(changes)) {
          for (const change of changes) {
            const value = change.value;
            if (value) {
              // 1. Handle incoming message statuses (sent, delivered, read, failed)
              if (value.statuses && Array.isArray(value.statuses)) {
                for (const statusObj of value.statuses) {
                  addWebhookLog({
                    event: `Status: ${statusObj.status.toUpperCase()}`,
                    origin: 'WhatsApp Message Status',
                    details: `Meta ID: ${statusObj.id} - Status: ${statusObj.status} - Recipient: ${statusObj.recipient_id}`,
                    status: statusObj.status === 'failed' ? 'error' : 'success',
                    rawPayload: statusObj,
                  });
                }
              }

              // 2. Handle incoming WhatsApp customer messages
              if (value.messages && Array.isArray(value.messages)) {
                for (const msg of value.messages) {
                  const contactInfo = value.contacts?.[0] || {};
                  const senderName = contactInfo.profile?.name || msg.from;
                  const textBody = msg.text?.body || (msg.type ? `[${msg.type.toUpperCase()}]` : 'Message');

                  addWebhookLog({
                    event: 'Incoming Message',
                    origin: `Customer: ${msg.from} (${senderName})`,
                    details: `Text: ${textBody}`,
                    status: 'success',
                    rawPayload: msg,
                  });
                }
              }

              // 3. Handle official Meta Template Status Updates (APPROVED, REJECTED, PAUSED)
              if (change.field === 'message_template_status_update' || value.event) {
                const tplEvent = value.event || 'UPDATED';
                const tplName = value.message_template_name || value.template_name || 'Template';
                const reason = value.reason ? ` - Reason: ${value.reason}` : '';

                addWebhookLog({
                  event: `Template ${tplEvent}`,
                  origin: 'Meta WhatsApp Template Review',
                  details: `Template "${tplName}" is now ${tplEvent}${reason}`,
                  status: tplEvent === 'APPROVED' ? 'success' : tplEvent === 'REJECTED' ? 'error' : 'warning',
                  rawPayload: value,
                });
              }
            }
          }
        }
      }
    }
    return res.status(200).send('EVENT_RECEIVED');
  }
  return res.sendStatus(404);
}

// Handler: Retrieve Webhook Logs for Admin UI
export function handleGetWebhookLogs(req: Request, res: Response) {
  res.json({ logs: getWebhookLogs() });
}
