sed -i '/throw new Error('\''Müşteri hesabı oluşturulamadı.'\'');/c\
    if (contentType \&\& contentType.includes("application/json")) {\
      const errRes = await res.json();\
      if (errRes.details) {\
        throw new Error(errRes.details.map((d: any) => d.message).join(", "));\
      }\
      throw new Error(errRes.error || "Müşteri hesabı oluşturulamadı.");\
    }\
    throw new Error("Müşteri hesabı oluşturulamadı.");' src/context/RealtimeContext.tsx
