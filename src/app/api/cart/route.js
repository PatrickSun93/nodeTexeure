import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    // Forward the request to the backend
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Forward authorization header if present
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      headers.authorization = authHeader;
    }
    
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:6666';
    const fullUrl = `${backendUrl}/api/cart`;
    console.log('BACKEND_URL:', JSON.stringify(process.env.BACKEND_URL));
    console.log('Full URL:', JSON.stringify(fullUrl));
    console.log('URL length:', fullUrl.length);
    
    const backendResponse = await fetch(fullUrl, {
      method: 'GET',
      headers
    });

    const data = await backendResponse.json();
    
    return NextResponse.json(data, { 
      status: backendResponse.status 
    });
  } catch (error) {
    console.error('Error fetching cart:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Failed to fetch cart',
        error: error.message 
      },
      { status: 500 }
    );
  }
}