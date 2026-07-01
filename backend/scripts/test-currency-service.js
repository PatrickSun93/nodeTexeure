const currencyService = require('../services/currencyService');

async function testCurrencyService() {
  console.log('🧪 Testing Currency Service...\n');

  try {
    // Test 1: Get all currencies
    console.log('1. Testing getAllCurrencies()');
    const currencies = currencyService.getAllCurrencies();
    console.log('✅ Supported currencies:', Object.keys(currencies.currencies));
    console.log('   Base currency:', currencies.baseCurrency);
    console.log('   Last update:', currencies.lastUpdate);
    console.log();

    // Test 2: Currency conversion
    console.log('2. Testing currency conversion');
    const usdAmount = 100;
    const cnyAmount = currencyService.convertFromBase(usdAmount, 'CNY');
    const eurAmount = currencyService.convertFromBase(usdAmount, 'EUR');
    
    console.log(`✅ $${usdAmount} USD = ¥${cnyAmount.toFixed(2)} CNY`);
    console.log(`✅ $${usdAmount} USD = €${eurAmount.toFixed(2)} EUR`);
    console.log();

    // Test 3: Cross-currency conversion
    console.log('3. Testing cross-currency conversion');
    const cnyToEur = currencyService.convertCurrency(100, 'CNY', 'EUR');
    console.log(`✅ ¥100 CNY = €${cnyToEur.toFixed(2)} EUR`);
    console.log();

    // Test 4: Currency formatting
    console.log('4. Testing currency formatting');
    const formattedUSD = currencyService.formatCurrency(123.45, 'USD', 'en-US');
    const formattedCNY = currencyService.formatCurrency(123.45, 'CNY', 'zh-CN');
    const formattedEUR = currencyService.formatCurrency(123.45, 'EUR', 'de-DE');
    
    console.log(`✅ USD formatting: ${formattedUSD}`);
    console.log(`✅ CNY formatting: ${formattedCNY}`);
    console.log(`✅ EUR formatting: ${formattedEUR}`);
    console.log();

    // Test 5: Country to currency detection
    console.log('5. Testing country to currency detection');
    const usCurrency = currencyService.detectCurrencyByCountry('US');
    const cnCurrency = currencyService.detectCurrencyByCountry('CN');
    const gbCurrency = currencyService.detectCurrencyByCountry('GB');
    
    console.log(`✅ US -> ${usCurrency}`);
    console.log(`✅ CN -> ${cnCurrency}`);
    console.log(`✅ GB -> ${gbCurrency}`);
    console.log();

    // Test 6: IP location detection (with localhost fallback)
    console.log('6. Testing IP location detection');
    const locationInfo = await currencyService.detectLocationAndCurrency('127.0.0.1');
    console.log('✅ Location info for localhost:', locationInfo);
    console.log();

    // Test 7: Conversion info
    console.log('7. Testing conversion info');
    const conversionInfo = currencyService.getConversionInfo(50, 'CNY', 'en-US');
    console.log('✅ Conversion info for $50 USD to CNY:');
    console.log('   Original:', conversionInfo.formattedOriginal);
    console.log('   Converted:', conversionInfo.formattedConverted);
    console.log('   Exchange rate:', conversionInfo.exchangeRate);
    console.log();

    // Test 8: Currency symbols and names
    console.log('8. Testing currency symbols and names');
    const currencies_list = ['USD', 'CNY', 'EUR', 'GBP', 'JPY'];
    currencies_list.forEach(currency => {
      const symbol = currencyService.getCurrencySymbol(currency);
      const name = currencyService.getCurrencyName(currency);
      console.log(`✅ ${currency}: ${symbol} - ${name}`);
    });
    console.log();

    // Test 9: Exchange rate updates
    console.log('9. Testing exchange rate updates');
    console.log('⏳ Updating exchange rates...');
    await currencyService.updateExchangeRates();
    const updatedCurrencies = currencyService.getAllCurrencies();
    console.log('✅ Exchange rates updated at:', updatedCurrencies.lastUpdate);
    console.log();

    console.log('🎉 All currency service tests completed successfully!');

  } catch (error) {
    console.error('❌ Currency service test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testCurrencyService();
}

module.exports = testCurrencyService;