sed -i '/throw new Error(data.error || '\''Güncelleme başarısız'\'');/c\
        if (data.details) {\
          throw new Error(data.details.map((d: any) => d.message).join(", "));\
        }\
        throw new Error(data.error || "Güncelleme başarısız");' src/components/CustomerDetailsModal.tsx
