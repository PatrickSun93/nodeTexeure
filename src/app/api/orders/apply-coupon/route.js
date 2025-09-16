import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    
    // Forward the request to the backend
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Forward authorization header if present
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      headers.authorization = authHeader;
    }
    
    const backendResponse = await fetch(`${process.env.BACKEND_URL}/api/orders/apply-coupon`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const data = await backendResponse.json();
    
    return NextResponse.json(data, { 
      status: backendResponse.status 
    });
  } catch (error) {
    console.error('Error applying coupon:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Failed to apply coupon',
        error: error.message 
      },
      { status: 500 }
    );
  }
}