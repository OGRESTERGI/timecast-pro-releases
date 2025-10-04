# API Troubleshooting Guide για TimeCast Pro

## 🔧 ΓΕΜΗ API Diagnostics

### Quick Health Check
```bash
curl http://localhost:3001/api/gemi/health
```

### Τι να ελέγχεις όταν το ΓΕΜΗ API δεν δουλεύει:

#### 1. **Rate Limit Check**
```json
"rateLimit": {
    "currentCalls": 3,
    "maxCalls": 8,
    "available": 5
}
```
- Αν `available: 0` → Περίμενε 1 λεπτό
- Reset κάθε λεπτό

#### 2. **Response Time Check**
```json
"responseTime": "2847ms"
```
- **Καλό**: < 3000ms
- **Αργό**: 3000-8000ms  
- **Timeout**: > 10000ms

#### 3. **Network Connectivity**
```bash
# Test direct API access
curl -H "api_key: pxIOODz6Zex3fFOLcrXcr0FwIx75wQxE" \
     "https://opendata-api.businessportal.gr/api/opendata/v1/companies?name=test&resultsSize=1"
```

#### 4. **Expected Health Response**
```json
{
  "overallStatus": "HEALTHY",
  "testResult": {
    "statusCode": 200,
    "responseTime": "1234ms",
    "companyCount": 10,
    "success": true
  }
}
```

### Συνηθισμένα Προβλήματα:

#### ❌ **Timeout Errors**
**Αιτία**: Το ΓΕΜΗ API είναι αργό ή φορτωμένο
**Λύση**: 
- Restart server
- Περίμενε 5-10 λεπτά
- Ελέγξε internet connection

#### ❌ **Rate Limit Exceeded**  
**Αιτία**: Πάρα πολλά requests (>8/minute)
**Λύση**:
- Περίμενε 60 δευτερόλεπτα
- Check rate limit με `/api/gemi/health`

#### ❌ **JSON Parse Error**
**Αιτία**: ΓΕΜΗ API επέστρεψε HTML αντί JSON
**Λύση**:
- Check API key validity
- Ελέγξε αν το API endpoint άλλαξε

### Production Environment Checklist:

#### ✅ **Πριν το deployment**
- [ ] Test `/api/gemi/health` endpoint
- [ ] Verify API key: `pxIOODz6Zex3fFOLcrXcr0FwIx75wQxE`
- [ ] Check firewall rules για outbound HTTPS
- [ ] Test από production server IP

#### ✅ **Σε περίπτωση προβλήματος**
1. **Immediate check**: `curl localhost:3001/api/gemi/health`
2. **Rate limit**: Ελέγξε `rateLimit.available`
3. **Network**: `ping opendata-api.businessportal.gr`
4. **Manual test**: Direct API call με curl
5. **Restart**: Restart TimeCast server αν χρειάζεται

---

## 🇫🇷 INSEE API Diagnostics

### Quick Test
```bash
curl "http://localhost:3001/api/insee/search-companies?name=test"
```

### Rate Limits
- **INSEE**: 30 calls/minute
- **ΓΕΜΗ**: 8 calls/minute

### Troubleshooting Steps
1. Check OAuth token validity
2. Verify API rate limits
3. Test direct API access

---

## 📞 Support Information

**ΓΕΜΗ API**: 
- Support: `pxIOODz6Zex3fFOLcrXcr0FwIx75wQxE`
- Endpoint: `opendata-api.businessportal.gr`

**Diagnostic Endpoints**:
- ΓΕΜΗ Health: `/api/gemi/health`  
- INSEE Status: `/api/insee/search-companies?name=test`

**Rate Limits**:
- ΓΕΜΗ: 8/minute
- INSEE: 30/minute